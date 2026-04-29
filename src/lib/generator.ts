import { GoogleGenAI, Type } from "@google/genai";
import { db, auth } from "./firebase";
import { doc, updateDoc, collection, addDoc, serverTimestamp, deleteDoc, writeBatch } from "firebase/firestore";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface GenerationParams {
  userId: string;
  websiteId: string;
  batchId: string;
  apiKey: string;
  keyword: string;
  siteUrl: string;
  siteUser: string;
  sitePass: string;
}

export async function generateAndPublish(params: GenerationParams) {
  const { userId, websiteId, batchId, apiKey, keyword, siteUrl, siteUser, sitePass } = params;
  
  const articlePath = `users/${userId}/articles`;
  let articleRef;
  
  try {
    articleRef = await addDoc(collection(db, articlePath), {
      keyword,
      title: `Processing: ${keyword}`,
      content: '',
      status: 'draft',
      websiteId,
      batchId,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, articlePath);
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const generateWithProxy = async (prompt: string, schema: any) => {
      if (apiKey === "system-default" || !apiKey) {
        const response = await window.fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, schema, keyword })
        });
        if (!response.ok) throw new Error(await response.text());
        return await response.json();
      } else {
        const result = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt.replace("${keyword}", keyword),
          config: {
            responseMimeType: "application/json",
            responseSchema: schema
          }
        });
        return { text: result.text };
      }
    };

    // 1. Generate SEO Data
    const seoDataResponse = await generateWithProxy(
      `Act as an expert gaming SEO writer. Convert the keyword "${keyword}" into a trending, high-CTR SEO title, meta description, and a URL slug.`,
      {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          metaDescription: { type: Type.STRING },
          slug: { type: Type.STRING }
        },
        required: ["title", "metaDescription", "slug"]
      }
    );

    const seoData = JSON.parse(seoDataResponse.text);

    await updateDoc(articleRef, {
      title: seoData.title,
      metaDescription: seoData.metaDescription,
      slug: seoData.slug,
    });

    // 2. Generate Content
    const contentDataResponse = await generateWithProxy(
      `Act as an expert gaming industry historian and critic. Write a comprehensive, high-quality, and deeply researched article for the title: "\${title}".
      
      CRITICAL REQUIREMENTS:
      - LENGTH: Minimum 1200 words of deep, high-value content. Do not provide a summary; provide an exhaustive deep dive.
      - STRUCTURE: Use clear, SEO-optimized H2 and H3 subheadings.
      - MANDATORY SECTIONS: 
        1. "What You Will Learn": A high-impact summary of key knowledge points.
        2. "The Evolution & History": Detailed context of how this topic emerged.
        3. "Core Mechanics & Deep Dive": Technical analysis, advanced strategies, or deep features.
        4. "GEO-targeted optimization": A section discussing regional trends, local market impact, and global players related to this keyword.
        5. "Future Outlook": Predictions, industry shifts, and what's next.
        6. "FAQ": Comprehensive answers to at least 5 common community questions.
      - TONE: Authoritative, expert, and engaging.
      - OUTPUT: Raw HTML (no <html>, <body>, or <script> tags). 
      
      JSON FIELD SPECIFICATIONS:
      1. "contentHtml": MUST ONLY contain the article body (Intro, What You Will Learn, History, Deep Dive, GEO, Future, FAQ). DO NOT put any JSON or Schema inside this field.
      2. "schemaMarkup": MUST contain valid JSON-LD code for "Article" and "FAQPage" entities. DO NOT wrap this in <script> tags; provide the raw JSON-LD string.
      
      CRITICAL: Ensure the word count exceeds 1200 words. Verification will be performed on the text length.`.replace("${title}", seoData.title),
      {
        type: Type.OBJECT,
        properties: {
          contentHtml: { type: Type.STRING },
          schemaMarkup: { type: Type.STRING }
        },
        required: ["contentHtml", "schemaMarkup"]
      }
    );

    const contentData = JSON.parse(contentDataResponse.text);

    await updateDoc(articleRef, {
      content: contentData.contentHtml,
      schemaMarkup: contentData.schemaMarkup,
    });

    // 3. Publish to WordPress
    await publishToWordPress(userId, articleRef.id, {
      siteUrl,
      siteUser,
      sitePass
    });

    return { success: true, articleId: articleRef.id };

  } catch (error: any) {
    console.error("Critical Failure:", error);
    if (articleRef) {
      try {
        await updateDoc(articleRef, {
          status: 'error',
          error: error.message || "Unknown error",
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, articleRef.path);
      }
    }
    throw error;
  }
}

export async function publishToWordPress(
  userId: string, 
  articleId: string, 
  site: { siteUrl: string; siteUser: string; sitePass: string }
) {
  const articleRef = doc(db, 'users', userId, 'articles', articleId);
  const { siteUrl, siteUser, sitePass } = site;
  
  try {
    // Get latest article data
    const snapshot = await window.fetch(siteUrl).then(() => ({})); // Dummy to avoid unused variable if needed, actually we just need getDoc
    const { getDoc } = await import("firebase/firestore");
    const articleDoc = await getDoc(articleRef);
    if (!articleDoc.exists()) throw new Error("Article not found");
    const article = articleDoc.data();

    const authHeader = btoa(`${siteUser}:${sitePass}`);
    const wpResponse = await window.fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authHeader}`
      },
      body: JSON.stringify({
        title: article.title,
        content: article.content,
        status: 'draft', // Always draft for safety
        excerpt: article.metaDescription,
        slug: article.slug,
      })
    });

    if (!wpResponse.ok) {
      const errorMsg = await wpResponse.text();
      throw new Error(`WordPress error: ${errorMsg}`);
    }

    const wpPost = await wpResponse.json();

    await updateDoc(articleRef, {
      status: 'published',
      wpPostId: wpPost.id.toString(),
      wpUrl: wpPost.link,
      updatedAt: serverTimestamp(),
    });

    return wpPost;
  } catch (error: any) {
    await updateDoc(articleRef, {
      status: 'error',
      error: error.message || "Publishing failed",
      updatedAt: serverTimestamp(),
    });
    throw error;
  }
}

export async function deleteArticle(userId: string, articleId: string) {
  const articleRef = doc(db, 'users', userId, 'articles', articleId);
  try {
    await deleteDoc(articleRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, articleRef.path);
  }
}

export async function bulkDeleteArticles(userId: string, articleIds: string[]) {
  const batch = writeBatch(db);
  const paths: string[] = [];
  
  articleIds.forEach(id => {
    const articleRef = doc(db, 'users', userId, 'articles', id);
    batch.delete(articleRef);
    paths.push(articleRef.path);
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, paths.join(', '));
  }
}
