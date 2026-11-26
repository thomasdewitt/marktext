// Shared by the main process (src/main/blogPreview) and the editor window
// (src/renderer/src/components/blogPreview).

/** The URL scheme the preview's pages are served under. */
export const BLOG_PREVIEW_SCHEME = 'mt-blog-preview'

/** The preview's session. Not `persist:`, so nothing of it is kept on disk. */
export const BLOG_PREVIEW_PARTITION = 'mt-blog-preview'
