"""
TeleVault — Main Entry Point
===============================
Launches the TeleVault application:
  1. Starts FastAPI server in background thread
  2. Opens PyWebView window pointing to the frontend

Usage:
  python main.py           # Full app (PyWebView + server)
  python main.py --dev     # Dev mode (server only, no PyWebView)

Author: Liethueis-Foundation © 2026
"""

import sys
import os
import time
import threading
import logging
import signal

# Ensure backend directory is in Python path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from config import DATA_DIR, SERVER_HOST, SERVER_PORT, FRONTEND_DEV_URL

logger = logging.getLogger("televault.main")


def start_server_thread():
    """Start the FastAPI server in a background thread."""
    logger.info("Importing uvicorn")
    import uvicorn
    logger.info("Importing FastAPI app")
    from server import app
    logger.info("FastAPI app imported")

    logger.info("Creating uvicorn config")
    config = uvicorn.Config(
        app,
        host=SERVER_HOST,
        port=SERVER_PORT,
        log_level="info",
        log_config=None,
        loop="asyncio",
    )
    logger.info("Creating uvicorn server")
    server = uvicorn.Server(config)
    logger.info("Uvicorn server created")

    thread = threading.Thread(target=server.run, daemon=True)
    logger.info("Starting server thread")
    thread.start()
    logger.info("Server thread started")

    # Wait for server to be ready
    import urllib.request
    for _ in range(50):  # 5 seconds max
        try:
            urllib.request.urlopen(f"http://{SERVER_HOST}:{SERVER_PORT}/health", timeout=1)
            logger.info(f"Server ready at http://{SERVER_HOST}:{SERVER_PORT}")
            return server, thread
        except Exception:
            time.sleep(0.1)

    logger.warning("Server may not be fully ready yet, continuing...")
    return server, thread


def start_pywebview(url: str):
    """
    Open a PyWebView window pointing to the frontend.
    Blocks until the window is closed.
    """
    try:
        import webview
    except ImportError:
        logger.error(
            "PyWebView not installed. Install it with: pip install pywebview\n"
            "Or run in dev mode: python main.py --dev"
        )
        sys.exit(1)

    window = webview.create_window(
        title="TeleVault",
        url=url,
        width=1200,
        height=800,
        min_size=(800, 600),
        resizable=True,
        text_select=False,
        confirm_close=False,
    )

    logger.info(f"Opening TeleVault window → {url}")
    webview.start(debug=("--debug" in sys.argv))


def main():
    """Main entry point."""
    log_file = os.path.join(DATA_DIR, "televault.log")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )

    dev_mode = "--dev" in sys.argv

    print()
    print("=" * 55)
    print("  TeleVault -- Encrypted Unlimited Cloud Storage")
    print("  Powered by Telegram | AES-256-GCM Encryption")
    print("  Liethueis Foundation (c) 2026")
    print("=" * 55)
    print()

    # Start server
    try:
        server, server_thread = start_server_thread()
    except Exception:
        logger.exception("TeleVault startup failed")
        raise
    print(f"  [OK] Backend server:  http://{SERVER_HOST}:{SERVER_PORT}")

    if dev_mode:
        print(f"  [OK] Dev mode:        Open {FRONTEND_DEV_URL} in browser")
        print(f"  [OK] Server running:  Press Ctrl+C to stop")
        print()

        # Keep main thread alive
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n  Shutting down...")
            sys.exit(0)
    else:
        # Full desktop mode
        frontend_url = f"http://{SERVER_HOST}:{SERVER_PORT}"
        print(f"  [OK] Frontend:        {frontend_url}")
        print()

        start_pywebview(frontend_url)

        # Cleanup after window closes
        print("\n  TeleVault closed. Goodbye!")


if __name__ == "__main__":
    main()
