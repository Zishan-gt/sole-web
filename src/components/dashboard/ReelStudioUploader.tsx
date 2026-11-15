import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Film,
  Image as ImageIcon,
  Pause,
  Play,
  Scissors,
  Sparkles,
  Upload,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { apiFetch } from '../../lib/api';
import { useRealtime } from '../../context/RealtimeContext';
import type { PostItem } from '../../types/app';
import { SafeImage } from '../BusinessCard';

interface ReelStudioUploaderProps {
  businessId: string;
  onCreated: (post: PostItem) => void;
}

interface FilmstripFrame {
  timeSec: number;
  dataUrl: string;
}

function formatSeconds(sec: number): string {
  const clean = Math.max(0, sec);
  const mins = Math.floor(clean / 60);
  const rem = clean % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem.toFixed(1)}`;
}

async function uploadBinaryMedia(
  blob: Blob,
  contentType: string,
  onProgress?: (pct: number) => void
): Promise<{ url: string; mimeType: string; sizeBytes: number }> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/owner/media/upload');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && parsed.url) {
          resolve(parsed);
        } else {
          reject(new Error(parsed.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error while uploading media'));
    xhr.send(blob);
  });
}

export const ReelStudioUploader: React.FC<ReelStudioUploaderProps> = ({
  businessId,
  onCreated,
}) => {
  const { pushToast } = useRealtime();

  const [mode, setMode] = useState<'video' | 'photo'>('video');
  const [mediaUrl, setMediaUrl] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);

  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [caption, setCaption] = useState('');
  const [isPinned, setIsPinned] = useState(false);

  // Video timing & filmstrip states
  const [durationSec, setDurationSec] = useState<number>(0);
  const [trimStartSec, setTrimStartSec] = useState<number>(0);
  const [trimEndSec, setTrimEndSec] = useState<number>(0);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(true);
  const [filmstrip, setFilmstrip] = useState<FilmstripFrame[]>([]);
  const [extractingStrip, setExtractingStrip] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Revoke object URLs on unmount or replacement
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    return () => {
      if (coverPreviewUrl && coverPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(coverPreviewUrl);
      }
    };
  }, [coverPreviewUrl]);

  const resetMedia = () => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    setCoverPreviewUrl(null);
    setMediaUrl('');
    setPosterUrl('');
    setDurationSec(0);
    setTrimStartSec(0);
    setTrimEndSec(0);
    setCurrentTimeSec(0);
    setFilmstrip([]);
    setUploadPct(null);
  };

  // Extract 8 timeline filmstrip thumbnails & default first frame cover using offscreen video + canvas
  const extractFilmstripAndCover = useCallback(async (objectUrl: string) => {
    setExtractingStrip(true);
    try {
      const probe = document.createElement('video');
      probe.src = objectUrl;
      probe.muted = true;
      probe.playsInline = true;
      probe.preload = 'auto';

      await new Promise<void>((resolve, reject) => {
        probe.onloadedmetadata = () => resolve();
        probe.onerror = () => reject(new Error('Could not decode video metadata'));
      });

      const dur = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 10;
      const roundedDur = Number(dur.toFixed(1));
      setDurationSec(roundedDur);
      setTrimStartSec(0);
      setTrimEndSec(roundedDur);

      const width = 180;
      const aspect = probe.videoWidth && probe.videoHeight ? probe.videoHeight / probe.videoWidth : 16 / 9;
      const height = Math.max(100, Math.min(340, Math.round(width * aspect)));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const frameCount = 8;
      const frames: FilmstripFrame[] = [];
      for (let i = 0; i < frameCount; i++) {
        const target = Math.min(dur - 0.05, (dur * i) / Math.max(1, frameCount - 1));
        const safeTime = Math.max(0.05, target);
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            probe.removeEventListener('seeked', onSeeked);
            resolve();
          };
          probe.addEventListener('seeked', onSeeked);
          probe.currentTime = safeTime;
        });
        ctx.drawImage(probe, 0, 0, width, height);
        frames.push({
          timeSec: Number(safeTime.toFixed(1)),
          dataUrl: canvas.toDataURL('image/jpeg', 0.65),
        });
      }
      setFilmstrip(frames);
    } catch (err) {
      console.warn('Filmstrip extraction skipped:', err);
    } finally {
      setExtractingStrip(false);
    }
  }, []);

  const captureFrameAsCover = useCallback(
    async (seekSec?: number) => {
      const video = videoRef.current;
      if (!video) return;
      setUploadingCover(true);
      try {
        if (typeof seekSec === 'number' && Number.isFinite(seekSec)) {
          video.currentTime = seekSec;
          await new Promise<void>((resolve) => {
            const done = () => {
              video.removeEventListener('seeked', done);
              resolve();
            };
            video.addEventListener('seeked', done);
            window.setTimeout(done, 400);
          });
        }

        const targetW = Math.min(720, video.videoWidth || 540);
        const ratio = video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 16 / 9;
        const targetH = Math.round(targetW * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(video, 0, 0, targetW, targetH);

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
        );
        if (!blob) throw new Error('Could not capture frame');

        const localCover = URL.createObjectURL(blob);
        setCoverPreviewUrl(localCover);
        const uploaded = await uploadBinaryMedia(blob, 'image/jpeg');
        setPosterUrl(uploaded.url);
        pushToast({ title: 'Reel cover captured' });
      } catch (err) {
        pushToast({
          title: (err as Error).message || 'Could not capture frame (use custom cover upload)',
          variant: 'error',
        });
      } finally {
        setUploadingCover(false);
      }
    },
    [pushToast]
  );

  const handleVideoFile = async (file: File) => {
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg'];
    const mime = allowed.includes(file.type) ? file.type : 'video/mp4';
    if (file.size > 45 * 1024 * 1024) {
      pushToast({ title: 'Video must be 45 MB or smaller', variant: 'error' });
      return;
    }

    const objUrl = URL.createObjectURL(file);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(objUrl);
    setMode('video');
    setUploadPct(1);

    // Extract timeline filmstrip locally without CORS taint while uploading binary to server
    void extractFilmstripAndCover(objUrl);

    try {
      const res = await uploadBinaryMedia(file, mime, (pct) => setUploadPct(pct));
      setMediaUrl(res.url);
      setUploadPct(null);
      pushToast({ title: 'Video uploaded — adjust trim & cover below' });
    } catch (err) {
      setUploadPct(null);
      pushToast({ title: (err as Error).message || 'Video upload failed', variant: 'error' });
    }
  };

  const handleImageFileUpload = async (file: File, target: 'photo' | 'cover') => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const mime = allowed.includes(file.type) ? file.type : 'image/jpeg';
    if (file.size > 15 * 1024 * 1024) {
      pushToast({ title: 'Image must be 15 MB or smaller', variant: 'error' });
      return;
    }

    if (target === 'cover') setUploadingCover(true);
    else setUploadPct(5);

    try {
      const res = await uploadBinaryMedia(file, mime, (pct) => {
        if (target === 'photo') setUploadPct(pct);
      });
      if (target === 'cover') {
        setPosterUrl(res.url);
        setCoverPreviewUrl(res.url);
        pushToast({ title: 'Custom cover uploaded' });
      } else {
        setMediaUrl(res.url);
        pushToast({ title: 'Photo uploaded' });
      }
    } catch (err) {
      pushToast({ title: (err as Error).message || 'Image upload failed', variant: 'error' });
    } finally {
      setUploadingCover(false);
      setUploadPct(null);
    }
  };

  // Auto-capture initial cover frame once local video metadata finishes loading if no poster set yet
  const handleLoadedVideoMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.duration && Number.isFinite(video.duration)) {
      const dur = Number(video.duration.toFixed(1));
      setDurationSec(dur);
      setTrimEndSec((prev) => (prev > 0 ? Math.min(prev, dur) : dur));
    }
    if (trimStartSec > 0) {
      video.currentTime = trimStartSec;
    }
  };

  // Loop playback seamlessly within [trimStartSec, trimEndSec]
  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const t = video.currentTime;
    setCurrentTimeSec(t);
    const effectiveEnd = trimEndSec > trimStartSec ? trimEndSec : durationSec;
    if (effectiveEnd > 0 && t >= effectiveEnd) {
      video.currentTime = trimStartSec;
      if (playing) void video.play().catch(() => {});
    }
  };

  const togglePlayPreview = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime < trimStartSec || (trimEndSec > 0 && video.currentTime >= trimEndSec)) {
        video.currentTime = trimStartSec;
      }
      void video.play().catch(() => {});
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const handleTrimStartChange = (nextStart: number) => {
    const maxAllowed = Math.max(0, (trimEndSec || durationSec) - 1);
    const clamped = Math.max(0, Math.min(nextStart, maxAllowed));
    setTrimStartSec(Number(clamped.toFixed(1)));
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
      setCurrentTimeSec(clamped);
    }
  };

  const handleTrimEndChange = (nextEnd: number) => {
    const minAllowed = Math.min(durationSec, trimStartSec + 1);
    const clamped = Math.min(durationSec, Math.max(nextEnd, minAllowed));
    setTrimEndSec(Number(clamped.toFixed(1)));
    if (videoRef.current && videoRef.current.currentTime > clamped) {
      videoRef.current.currentTime = trimStartSec;
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaUrl.trim()) {
      pushToast({
        title: mode === 'video' ? 'Upload a video or paste a video URL first' : 'Upload a photo or paste an image URL first',
        variant: 'error',
      });
      return;
    }
    if (uploadPct !== null) {
      pushToast({ title: 'Please wait for upload to complete', variant: 'error' });
      return;
    }

    setPublishing(true);
    try {
      const payload = {
        businessId,
        type: mode,
        mediaUrl: mediaUrl.trim(),
        posterUrl: mode === 'video' && posterUrl.trim() ? posterUrl.trim() : null,
        caption: caption.trim(),
        isPinned,
        trimStartSec: mode === 'video' && durationSec > 0 ? Math.round(trimStartSec * 10) / 10 : null,
        trimEndSec:
          mode === 'video' && durationSec > 0 && trimEndSec > trimStartSec
            ? Math.round(trimEndSec * 10) / 10
            : null,
        durationSec: mode === 'video' && durationSec > 0 ? Math.round(durationSec * 10) / 10 : null,
      };
      const res = await apiFetch<{ post: PostItem }>('/api/owner/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onCreated(res.post);
      resetMedia();
      setCaption('');
      setIsPinned(false);
      pushToast({
        title: mode === 'video' ? 'Reel published to Feed & Reels' : 'Photo post published',
      });
    } catch (err) {
      pushToast({ title: (err as Error).message || 'Could not publish post', variant: 'error' });
    } finally {
      setPublishing(false);
    }
  };

  const activeVideoSrc = localPreviewUrl || mediaUrl;
  const clipLength =
    durationSec > 0 ? Math.max(0, (trimEndSec || durationSec) - trimStartSec) : 0;

  return (
    <form
      onSubmit={handlePublish}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5"
    >
      {/* Header + Post Type Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Creator Reel & Post Studio</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Upload native videos (up to 45 MB), trim your best seconds, pick a cover frame, and publish directly to Reels.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => {
              setMode('video');
              resetMedia();
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              mode === 'video'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Video Reel</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('photo');
              resetMedia();
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              mode === 'photo'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Photo Post</span>
          </button>
        </div>
      </div>

      {mode === 'video' ? (
        <div className="grid lg:grid-cols-12 gap-5 items-start">
          {/* Left: Vertical 9:16 Live Preview Frame */}
          <div className="lg:col-span-5 flex flex-col items-center">
            {activeVideoSrc ? (
              <div className="relative w-full max-w-[260px] aspect-[9/16] rounded-2xl overflow-hidden bg-black border border-slate-200 dark:border-slate-800 shadow-xl">
                <video
                  ref={videoRef}
                  src={activeVideoSrc}
                  poster={coverPreviewUrl || posterUrl || undefined}
                  autoPlay
                  muted={muted}
                  playsInline
                  onLoadedMetadata={handleLoadedVideoMetadata}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onClick={togglePlayPreview}
                  className="w-full h-full object-cover cursor-pointer"
                />

                {/* Top Controls */}
                <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between pointer-events-none">
                  <span className="px-2 py-1 rounded-md bg-black/65 backdrop-blur-xs text-[10px] font-semibold text-white tabular-nums">
                    {durationSec > 0 ? `${clipLength.toFixed(1)}s clip` : 'Video'}
                  </span>
                  <div className="flex items-center gap-1.5 pointer-events-auto">
                    <button
                      type="button"
                      onClick={() => setMuted((m) => !m)}
                      aria-label={muted ? 'Unmute preview' : 'Mute preview'}
                      className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    >
                      {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={resetMedia}
                      aria-label="Remove video"
                      className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Bottom Playhead Bar */}
                <div className="absolute bottom-2.5 inset-x-2.5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={togglePlayPreview}
                    className="px-2.5 py-1 rounded-lg bg-black/65 backdrop-blur-xs text-white text-[11px] font-semibold inline-flex items-center gap-1"
                  >
                    {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    <span className="tabular-nums">{formatSeconds(currentTimeSec)}</span>
                  </button>
                  {posterUrl && (
                    <span className="px-2 py-1 rounded-md bg-emerald-600/90 text-white text-[10px] font-semibold inline-flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Cover set
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleVideoFile(file);
                }}
                onClick={() => videoInputRef.current?.click()}
                className={`w-full max-w-[260px] aspect-[9/16] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-5 text-center cursor-pointer transition-colors ${
                  dragActive
                    ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:border-blue-500'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                  <Video className="w-6 h-6" />
                </div>
                <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Upload Vertical Reel
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Drag & drop or tap to select MP4, WebM, or MOV (max 45 MB)
                </p>
                <span className="mt-4 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold">
                  Choose Video File
                </span>
              </div>
            )}

            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/ogg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleVideoFile(file);
                e.target.value = '';
              }}
            />
          </div>

          {/* Right: Upload Progress, Trim Range, Filmstrip Cover Picker, Caption */}
          <div className="lg:col-span-7 space-y-4">
            {/* Upload Progress Banner */}
            {uploadPct !== null && (
              <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-blue-700 dark:text-blue-300">
                  <span>Uploading video to storefront storage...</span>
                  <span className="tabular-nums">{uploadPct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-blue-200 dark:bg-blue-900 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-150"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Video URL fallback or uploaded confirmation */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
                Video Source (uploaded path or direct MP4 URL)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Upload a video file or paste an .mp4 URL"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>File</span>
                </button>
              </div>
            </div>

            {/* Filmstrip Timeline & Trim Sliders */}
            {durationSec > 0 && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Trim Clip Range</span>
                  </span>
                  <span className="text-slate-500 tabular-nums">
                    {formatSeconds(trimStartSec)} – {formatSeconds(trimEndSec)} ({clipLength.toFixed(1)}s)
                  </span>
                </div>

                {/* Filmstrip Preview Bar */}
                <div className="relative h-14 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 flex">
                  {extractingStrip && filmstrip.length === 0 ? (
                    <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-500">
                      Generating timeline frames...
                    </div>
                  ) : filmstrip.length > 0 ? (
                    filmstrip.map((frame, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = frame.timeSec;
                            setCurrentTimeSec(frame.timeSec);
                          }
                        }}
                        title={`Jump to ${formatSeconds(frame.timeSec)}`}
                        className="flex-1 h-full relative overflow-hidden group"
                      >
                        <img
                          src={frame.dataUrl}
                          alt={`Frame ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors" />
                      </button>
                    ))
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-500">
                      Timeline ready ({durationSec.toFixed(1)}s total)
                    </div>
                  )}

                  {/* Shaded Trim Masks */}
                  {durationSec > 0 && (
                    <>
                      <div
                        className="absolute inset-y-0 left-0 bg-black/60 pointer-events-none"
                        style={{ width: `${(trimStartSec / durationSec) * 100}%` }}
                      />
                      <div
                        className="absolute inset-y-0 right-0 bg-black/60 pointer-events-none"
                        style={{
                          width: `${Math.max(0, ((durationSec - (trimEndSec || durationSec)) / durationSec) * 100)}%`,
                        }}
                      />
                      {/* Active Playhead */}
                      <div
                        className="absolute inset-y-0 w-0.5 bg-white shadow pointer-events-none"
                        style={{ left: `${Math.min(100, (currentTimeSec / durationSec) * 100)}%` }}
                      />
                    </>
                  )}
                </div>

                {/* Start & End Sliders */}
                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-500 mb-1 tabular-nums">
                      <span>Start Time</span>
                      <span>{formatSeconds(trimStartSec)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, durationSec - 1)}
                      step={0.1}
                      value={trimStartSec}
                      onChange={(e) => handleTrimStartChange(parseFloat(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-500 mb-1 tabular-nums">
                      <span>End Time</span>
                      <span>{formatSeconds(trimEndSec)}</span>
                    </div>
                    <input
                      type="range"
                      min={Math.min(durationSec, trimStartSec + 1)}
                      max={durationSec}
                      step={0.1}
                      value={trimEndSec}
                      onChange={(e) => handleTrimEndChange(parseFloat(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Cover Frame Picker */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  Reel Cover Image
                </span>
                <div className="flex items-center gap-2">
                  {localPreviewUrl && (
                    <button
                      type="button"
                      disabled={uploadingCover}
                      onClick={() => void captureFrameAsCover()}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{uploadingCover ? 'Saving...' : 'Capture Current Frame'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={uploadingCover}
                    onClick={() => coverInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold inline-flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Cover</span>
                  </button>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleImageFileUpload(f, 'cover');
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-12 h-16 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                  {coverPreviewUrl || posterUrl ? (
                    <SafeImage
                      src={coverPreviewUrl || posterUrl}
                      alt="Reel cover"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Cover URL (optional — capture a video frame or upload a custom cover)"
                  value={posterUrl}
                  onChange={(e) => {
                    setPosterUrl(e.target.value);
                    setCoverPreviewUrl(e.target.value || null);
                  }}
                  className="flex-1 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>
            </div>

            {/* Caption + Pin + Publish */}
            <textarea
              rows={3}
              placeholder="Write a caption for your reel — mention special offers, menu items, or neighborhood..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                />
                <span>Pin to top of storefront (max 3)</span>
              </label>

              <button
                type="submit"
                disabled={publishing || uploadPct !== null || !mediaUrl.trim()}
                className="min-h-[42px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 transition-colors"
              >
                {publishing ? 'Publishing Reel...' : 'Publish Reel'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Photo Post Mode */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Image URL or upload a photo file"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              className="flex-1 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Photo File</span>
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImageFileUpload(file, 'photo');
                e.target.value = '';
              }}
            />
          </div>

          {uploadPct !== null && (
            <div className="h-1.5 rounded-full bg-blue-200 dark:bg-blue-900 overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${uploadPct}%` }} />
            </div>
          )}

          {mediaUrl && (
            <div className="w-44 aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950">
              <SafeImage src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
            </div>
          )}

          <textarea
            rows={2}
            placeholder="Write a caption..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
              />
              <span>Pin to top (max 3)</span>
            </label>
            <button
              type="submit"
              disabled={publishing || uploadPct !== null || !mediaUrl.trim()}
              className="min-h-[42px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50"
            >
              {publishing ? 'Publishing...' : 'Publish Photo'}
            </button>
          </div>
        </div>
      )}
    </form>
  );
};
