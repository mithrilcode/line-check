"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { HttpError } = require("../lib/validate");
const { requireManager } = require("../auth");

/** Photos and PDFs only. SVG and HTML are refused because they can carry scripts. */
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "application/pdf"];
const MAX_BYTES = 20 * 1024 * 1024;

module.exports = function fileRoutes({ db, dataDir }) {
  const router = express.Router();
  const uploadDir = path.join(dataDir, "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });

  /** Upload: raw request body, original name in the X-File-Name header (URI-encoded). */
  router.post(
    "/files",
    requireManager,
    express.raw({ type: () => true, limit: MAX_BYTES }),
    (req, res) => {
      const type = (req.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.includes(type)) throw new HttpError(415, "Attach a photo or a PDF.");
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, "The file is empty.");

      let name = "File";
      try {
        name = decodeURIComponent(req.get("x-file-name") || "File");
      } catch {
        /* keep the default */
      }
      name = name.replace(/[\r\n"\\/]/g, "_").slice(0, 120) || "File";

      const id = crypto.randomUUID();
      fs.writeFileSync(path.join(uploadDir, id), req.body);
      db.prepare("INSERT INTO files (id, restaurant_id, original_name, content_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)").run(
        id, req.auth.restaurantId, name, type, req.body.length, req.auth.userId
      );
      res.status(201).json({ id, name });
    }
  );

  router.get("/files/:id", requireManager, (req, res) => {
    const file = db.prepare("SELECT * FROM files WHERE id = ? AND restaurant_id = ?").get(req.params.id, req.auth.restaurantId);
    if (!file) throw new HttpError(404, "File not found.");
    res.set({
      "Content-Type": file.content_type,
      "Content-Disposition": `inline; filename="${file.original_name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "Cache-Control": "private, max-age=3600",
    });
    res.sendFile(path.join(uploadDir, file.id));
  });

  return router;
};

/** Deletes file rows and their bytes on disk. Call after removing whatever referenced them. */
module.exports.deleteFiles = function deleteFiles(db, dataDir, fileIds) {
  const ids = fileIds.filter(Boolean);
  const remove = db.prepare("DELETE FROM files WHERE id = ?");
  ids.forEach((id) => {
    remove.run(id);
    fs.rm(path.join(dataDir, "uploads", id), { force: true }, () => {});
  });
};
