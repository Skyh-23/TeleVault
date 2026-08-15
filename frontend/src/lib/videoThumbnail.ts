const thumbnailCache = new Map<string, string>();

/**
 * Generates a video thumbnail by partially streaming the video,
 * capturing a frame using a canvas, and immediately aborting the stream.
 */
export async function generateVideoThumbnail(
    fileId: string, 
    folderId: number | null, 
    convertFileSrc: (path: string, folderId?: number | null) => string
): Promise<string> {
    
    if (thumbnailCache.has(fileId)) {
        return thumbnailCache.get(fileId)!;
    }

    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        
        // Use Tauri's custom protocol stream via the API utility
        video.src = convertFileSrc(fileId, folderId);
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.playsInline = true;
        
        // Timeout to prevent hanging on slow connections or broken streams
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error("Thumbnail generation timeout"));
        }, 8000);

        const cleanup = () => {
            clearTimeout(timeoutId);
            // Abort the stream request immediately
            video.src = "";
            video.load();
            video.onloadeddata = null;
            video.onseeked = null;
            video.onerror = null;
        };

        video.onloadeddata = () => {
            // Seek to 0.5s to capture a frame past the blank first frame
            video.currentTime = 0.5;
        };

        video.onseeked = () => {
            try {
                const canvas = document.createElement("canvas");
                // Limit resolution to save memory and improve performance
                const scale = Math.min(1, 480 / video.videoHeight);
                canvas.width = video.videoWidth * scale;
                canvas.height = video.videoHeight * scale;
                
                const ctx = canvas.getContext("2d");
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL("image/jpeg", 0.6); // 60% quality JPEG is enough for a thumbnail
                    
                    thumbnailCache.set(fileId, dataUrl);
                    cleanup();
                    resolve(dataUrl);
                } else {
                    cleanup();
                    reject(new Error("Failed to get canvas context"));
                }
            } catch (e) {
                cleanup();
                reject(e);
            }
        };

        video.onerror = (e) => {
            cleanup();
            reject(e);
        };
        
        // Force the browser to start fetching the stream
        video.play().catch(() => {
            // Ignore play() errors, as long as it starts buffering data, we are good.
        });
    });
}
