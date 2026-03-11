import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import mammoth from "mammoth";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Configure multer for memory storage
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route for document extraction
  app.post("/api/extract", upload.single("file"), async (req: any, res: Response) => {
    console.log(`Extraction request received for file: ${req.file?.originalname}`);
    try {
      if (!req.file) {
        console.warn("No file uploaded in request");
        return res.status(400).json({ error: "No file uploaded" });
      }

      let text = "";
      let html = "";
      const fileBuffer = req.file.buffer;
      const fileName = req.file.originalname;
      const mimeType = req.file.mimetype;
      const lowerFileName = fileName.toLowerCase();
      const base64 = fileBuffer.toString("base64");

      if (lowerFileName.endsWith(".pdf")) {
        try {
          const pdfParseModule = require("pdf-parse");
          let textResult = "";
          const PDFParseClass = pdfParseModule.PDFParse || (pdfParseModule.default && pdfParseModule.default.PDFParse);
          
          if (PDFParseClass) {
            const parser = new PDFParseClass({ data: fileBuffer });
            const result = await parser.getText();
            textResult = result.text;
          } else {
            const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default;
            if (typeof pdfParse === 'function') {
              const data = await pdfParse(fileBuffer);
              textResult = data.text;
            } else {
              throw new Error(`pdf-parse module structure is unrecognized.`);
            }
          }
          text = textResult;
        } catch (pdfError: any) {
          console.error("PDF Parse error:", pdfError);
          throw new Error(`Failed to parse PDF: ${pdfError.message}`);
        }
      } else if (lowerFileName.endsWith(".docx")) {
        const textResult = await mammoth.extractRawText({ buffer: fileBuffer });
        const htmlResult = await mammoth.convertToHtml({ buffer: fileBuffer });
        text = textResult.value;
        html = htmlResult.value;
      } else {
        return res.status(400).json({ error: "Unsupported file format. Please upload PDF or DOCX." });
      }

      // Basic cleaning: remove excessive whitespace for text
      const cleanedText = text.replace(/\s+/g, " ").trim();
      
      res.json({ 
        text: cleanedText, 
        html: html,
        base64: base64,
        mimeType: mimeType,
        fileName 
      });
    } catch (error: any) {
      console.error("Extraction error:", error);
      res.status(500).json({ 
        error: `Failed to extract text: ${error.message || 'Unknown error'}`,
        stack: error.stack
      });
    }
  });

  // Global error handler
  app.use((err: any, req: Request, res: Response, next: any) => {
    console.error("Global error handler:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LexiSummarize Server running on http://localhost:${PORT}`);
  });
}

startServer();
