import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { type Browser, type BrowserContext, type Page, chromium } from "playwright";

export interface BrowserSession {
  readonly id: string;
  navigate(url: string): Promise<{ title: string; url: string }>;
  getContent(): Promise<{ title: string; content: string }>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  fill(selector: string, text: string): Promise<void>;
  download(
    url: string,
    destinationRoot: "downloads",
    destinationPath: string,
  ): Promise<{ path: string; sizeBytes: number }>;
  close(): Promise<void>;
}

export interface BrowserServiceOptions {
  downloadsDir: string;
}

class BrowserSessionImpl implements BrowserSession {
  readonly id: string;
  private readonly context: BrowserContext;
  private readonly page: Page;
  private readonly downloadsDir: string;
  private closed = false;

  constructor(id: string, context: BrowserContext, page: Page, downloadsDir: string) {
    this.id = id;
    this.context = context;
    this.page = page;
    this.downloadsDir = downloadsDir;
  }

  async navigate(url: string): Promise<{ title: string; url: string }> {
    this.ensureOpen();
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    return {
      title: await this.page.title(),
      url: this.page.url(),
    };
  }

  async getContent(): Promise<{ title: string; content: string }> {
    this.ensureOpen();
    const title = await this.page.title();
    const content = await this.page.evaluate(() => document.body?.innerText ?? "");
    return { title, content };
  }

  async click(selector: string): Promise<void> {
    this.ensureOpen();
    await this.page.locator(selector).first().click();
  }

  async type(selector: string, text: string): Promise<void> {
    this.ensureOpen();
    await this.page.locator(selector).first().type(text);
  }

  async fill(selector: string, text: string): Promise<void> {
    this.ensureOpen();
    await this.page.locator(selector).first().fill(text);
  }

  async download(
    url: string,
    _destinationRoot: "downloads",
    destinationPath: string,
  ): Promise<{ path: string; sizeBytes: number }> {
    this.ensureOpen();
    const [download] = await Promise.all([
      this.page.waitForEvent("download"),
      this.page.evaluate((targetUrl) => {
        const a = document.createElement("a");
        a.href = targetUrl;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, url),
    ]);
    const target = join(this.downloadsDir, destinationPath);
    await mkdir(dirname(target), { recursive: true });
    await download.saveAs(target);
    const { size } = await stat(target);
    return { path: target, sizeBytes: size };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.context.close();
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw Object.assign(new Error("Browser session closed"), {
        code: "ERR_BROWSER_SESSION_NOT_FOUND",
      });
    }
  }
}

export class BrowserService {
  private browser: Browser | undefined;
  private readonly sessions = new Map<string, BrowserSessionImpl>();
  private readonly downloadsDir: string;

  constructor(options: BrowserServiceOptions) {
    this.downloadsDir = resolve(options.downloadsDir);
  }

  async createSession(options?: { sessionId?: string; url?: string }): Promise<{
    session: BrowserSession;
    url?: string;
    title?: string;
  }> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    const context = await this.browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const id = options?.sessionId ?? randomUUID();
    const session = new BrowserSessionImpl(id, context, page, this.downloadsDir);
    this.sessions.set(id, session);
    if (options?.url) {
      await session.navigate(options.url);
    }
    return {
      session,
      url: page.url(),
      title: await page.title().catch(() => undefined),
    };
  }

  getSession(id: string): BrowserSession | undefined {
    return this.sessions.get(id);
  }

  async destroySession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    await session.close();
    this.sessions.delete(id);
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.close();
    }
    this.sessions.clear();
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }
}
