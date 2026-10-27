"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type CameraHandle = { capture: () => string | null };

/** Front camera preview that can grab a small JPEG (photo proof) or feed a QR scanner. */
export const Camera = forwardRef<
  CameraHandle,
  { facing?: "user" | "environment"; onQr?: (text: string) => void; className?: string }
>(function Camera({ facing = "user", onQr, className }, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    capture() {
      const v = video.current;
      if (!v || !v.videoWidth) return null;
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 480 / v.videoWidth);
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.7);
    },
  }));

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopScan: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 640 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        if (!onQr) return;
        if ("BarcodeDetector" in window) {
          const Detector = (
            window as unknown as {
              BarcodeDetector: new (o: { formats: string[] }) => {
                detect: (s: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
              };
            }
          ).BarcodeDetector;
          const detector = new Detector({ formats: ["qr_code"] });
          let active = true;
          stopScan = () => (active = false);
          const loop = async () => {
            if (!active) return;
            try {
              const codes = await detector.detect(v);
              if (codes[0]?.rawValue) return onQr(codes[0].rawValue);
            } catch {}
            setTimeout(loop, 300);
          };
          void loop();
        } else {
          const { BrowserQRCodeReader } = await import("@zxing/browser");
          const reader = new BrowserQRCodeReader();
          const controls = await reader.decodeFromVideoElement(v, (result) => {
            if (result) onQr(result.getText());
          });
          stopScan = () => controls.stop();
        }
      } catch {
        setError("Camera unavailable. Allow camera access for this site.");
      }
    })();
    return () => {
      cancelled = true;
      stopScan?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, onQr]);

  return (
    <div className={className}>
      {error ? (
        <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white/80">
          {error}
        </div>
      ) : (
        <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
      )}
    </div>
  );
});
