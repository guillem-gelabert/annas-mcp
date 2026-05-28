import * as cheerio from "cheerio";

import type { Article, Book } from "./types";

const ARTICLE_LINK_SELECTOR = "a[href^='/md5/']";
const PRIMARY_RESULT_LINK_CLASS = "custom-a block mr-2 sm:mr-4 hover:opacity-80";

export function parseSize(meta: string): string | undefined {
  return meta.match(/\d+\.?\d*\s*(?:KB|MB|GB|TB)/i)?.[0];
}

export function absoluteUrl(baseOrigin: string, href: string): string {
  return new URL(href, baseOrigin).toString();
}

export function parseHashFromHref(href: string): string | undefined {
  const hash = href.replace(/^\/md5\//, "").trim();
  return hash || undefined;
}

export function parseArticleSearchResults(html: string, baseOrigin: string): Article[] {
  const $ = cheerio.load(html);
  const articles: Article[] = [];

  $(ARTICLE_LINK_SELECTOR).each((_, element) => {
    const link = $(element);
    if (link.attr("class") !== PRIMARY_RESULT_LINK_CLASS) {
      return;
    }

    const parent = link.parent();
    const info = parent.find("div.max-w-full");
    if (!info.length) {
      return;
    }

    const title = info.find(ARTICLE_LINK_SELECTOR).first().text().trim();
    const href = link.attr("href");
    const hash = href ? parseHashFromHref(href) : undefined;

    if (!title || !href || !hash) {
      return;
    }

    const authors = info.find("a[href^='/search'] span.icon-\\[mdi--user-edit\\]").parent().text().trim();
    const journal = info.find("a[href^='/search'] span.icon-\\[mdi--company\\]").parent().text().trim();
    const meta = info.find("div.text-gray-800").text();

    articles.push({
      title,
      authors,
      journal,
      size: parseSize(meta),
      hash,
      pageUrl: absoluteUrl(baseOrigin, href),
    });
  });

  return articles;
}

export function parseBookSearchResults(html: string, baseOrigin: string): Book[] {
  const $ = cheerio.load(html);
  const books: Book[] = [];

  $(ARTICLE_LINK_SELECTOR).each((_, element) => {
    const link = $(element);
    if (link.attr("class") !== PRIMARY_RESULT_LINK_CLASS) {
      return;
    }

    const parent = link.parent();
    const info = parent.find("div.max-w-full");
    if (!info.length) {
      return;
    }

    const title = info.find(ARTICLE_LINK_SELECTOR).first().text().trim();
    const href = link.attr("href");
    const hash = href ? parseHashFromHref(href) : undefined;

    if (!title || !href || !hash) {
      return;
    }

    const authors = info.find("a[href^='/search'] span.icon-\\[mdi--user-edit\\]").parent().text().trim();
    const publisher = info.find("a[href^='/search'] span.icon-\\[mdi--company\\]").parent().text().trim();
    const meta = info.find("div.text-gray-800").text();

    books.push({
      title,
      authors: authors || undefined,
      publisher: publisher || undefined,
      language: parseLanguage(meta),
      format: parseFormat(meta),
      size: parseSize(meta),
      hash,
      pageUrl: absoluteUrl(baseOrigin, href),
    });
  });

  return books;
}

export function parseFirstArticleHash(html: string): string | undefined {
  const $ = cheerio.load(html);
  const href = $(ARTICLE_LINK_SELECTOR).first().attr("href");
  return href ? parseHashFromHref(href) : undefined;
}

export function parseScidbPdfUrl(html: string, hash: string): string | null {
  const needle = hash.toLowerCase();
  const $ = cheerio.load(html);
  let found: string | null = null;
  $("a[href]").each((_, el) => {
    if (found) return;
    const href = $(el).attr("href") ?? "";
    if (href.startsWith("https://") && href.toLowerCase().includes(needle)) {
      found = href;
    }
  });
  return found;
}

export function parseArticleDetail(html: string): Partial<Article> {
  const $ = cheerio.load(html);
  const titleText = $("title").first().text();
  const title = titleText.includes(" - Anna") ? titleText.split(" - Anna")[0]?.trim() : titleText.trim();

  const description = $("meta[name=description]").attr("content")?.trim();
  const descriptionParts = description?.split("\n\n").map((part) => part.trim()).filter(Boolean) ?? [];
  const journal = descriptionParts[2] ?? descriptionParts[1] ?? description;

  const authors = $("a[href^='/search']")
    .filter((_, element) => $(element).find("span.icon-\\[mdi--user-edit\\]").length > 0)
    .first()
    .text()
    .trim();

  const sizeText = $("div.text-gray-500")
    .filter((_, element) => /(?:KB|MB|GB|TB)/i.test($(element).text()))
    .first()
    .text()
    .trim();

  return {
    title: title || undefined,
    authors: authors || undefined,
    journal: journal || undefined,
    size: parseSize(sizeText),
  };
}

function parseLanguage(meta: string): string | undefined {
  const match = meta.match(/[A-Za-z][A-Za-z\s]*\[.+?\]/);
  return match?.[0]?.replace(/^✅\s*/, "").trim() || undefined;
}

function parseFormat(meta: string): string | undefined {
  const match = meta.match(/\b(EPUB|PDF|MOBI|AZW3|AZW|DJVU|CBZ|CBR|FB2|DOCX?|TXT)\b/i);
  return match?.[0] || undefined;
}
