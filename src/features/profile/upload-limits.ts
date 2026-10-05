// Shared by the upload form (client) and the parse-resume route (server), so
// it must stay free of server-only imports.
//
// Vercel Functions reject request bodies over 4.5 MB with a 413 before our
// handler runs; 4 MB leaves room for the multipart envelope.
export const MAX_FILE_MB = 4;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
