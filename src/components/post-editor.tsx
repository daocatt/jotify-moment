"use client";

import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Image as ImageIcon, Video, Mic, Trash2, Square, Loader2 } from "lucide-react";
import { createPostAction } from "@/app/actions/posts";

const Youtube = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
  </svg>
);

interface PostEditorProps {
  onSuccess: () => void;
}

export function PostEditor({ onSuccess }: PostEditorProps) {
  const [content, setContent] = useState("");
  const [mediaFiles, setMediaFiles] = useState<Array<{ type: string; url: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const ytVideoId = useMemo(() => {
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = content.match(ytRegex);
    return match ? match[1] : null;
  }, [content]);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fileType: "image" | "video") => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate MIME type
      if (fileType === "image" && !file.type.startsWith("image/")) {
        toast.error("只能上传图片文件");
        continue;
      }
      if (fileType === "video" && !file.type.startsWith("video/")) {
        toast.error("只能上传视频文件");
        continue;
      }

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        
        if (data.error) {
          toast.error(data.error);
        } else {
          setMediaFiles((prev) => [...prev, { type: data.type, url: data.url, name: data.name }]);
        }
      } catch {
        toast.error("文件上传失败");
      }
    }
    
    setUploading(false);
    e.target.value = "";
  };

  // Start Audio Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      // Determine support MIME
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
        mimeType = "audio/ogg";
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        // Upload recorded audio to server
        setUploading(true);
        const file = new File([audioBlob], `voice_recording.${mimeType.split("/")[1]}`, { type: mimeType });
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.error) {
            toast.error(data.error);
          } else {
            setMediaFiles((prev) => [...prev, { type: "audio", url: data.url, name: "语音消息" }]);
            toast.success("语音录制并上传成功");
          }
        } catch {
          toast.error("录音上传失败");
        } finally {
          setUploading(false);
        }

        // Stop all audio track streams to release microphone
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error(error);
      toast.error("获取麦克风权限失败，无法录音");
    }
  };

  // Stop Audio Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const removeMedia = (index: number) => {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePublish = async () => {
    if (!content.trim() && mediaFiles.length === 0) {
      toast.error("发点什么吧...");
      return;
    }

    setLoading(true);
    const res = await createPostAction({
      content,
      mediaUrls: mediaFiles,
      ytVideoId,
    });
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(res.pending ? "已提交，等待管理员审核" : "发布成功");
      setContent("");
      setMediaFiles([]);
      onSuccess();
    }
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
      <Textarea
        placeholder="这一刻的想法... (支持 Markdown 语法)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[100px] border-none resize-none focus-visible:ring-0 p-0 shadow-none text-base bg-transparent"
      />

      {/* Media Attachments Preview */}
      {mediaFiles.length > 0 && (
        <div className="grid grid-cols-3 gap-2 py-2">
          {mediaFiles.map((file, idx) => (
            <div key={idx} className="relative aspect-square bg-muted rounded overflow-hidden group border border-border">
              {file.type === "image" && (
                <img src={file.url} alt={file.name} className="h-full w-full object-cover" />
              )}
              {file.type === "video" && (
                <video src={file.url} className="h-full w-full object-cover" muted />
              )}
              {file.type === "audio" && (
                <div className="h-full w-full flex flex-col items-center justify-center p-2 text-xs text-muted-foreground text-center">
                  <Mic className="size-6 text-green-500 mb-1" />
                  <span>语音消息</span>
                </div>
              )}
              <button
                onClick={() => removeMedia(idx)}
                className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* YouTube Preview */}
      {ytVideoId && (
        <div className="border border-border rounded-lg p-2 bg-muted flex items-center gap-3">
          <div className="relative aspect-video w-32 bg-black rounded overflow-hidden flex items-center justify-center">
            <img
              src={`https://img.youtube.com/vi/${ytVideoId}/0.jpg`}
              alt="YouTube Thumbnail"
              className="absolute inset-0 w-full h-full object-cover opacity-80"
            />
            <Youtube className="relative size-8 text-red-600 z-10" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-muted-foreground">已检测到 YouTube 链接</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">视频ID: {ytVideoId}</p>
          </div>
        </div>
      )}

      {/* Audio Recording overlay */}
      {isRecording && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center justify-between text-green-600 dark:text-green-400">
          <div className="flex items-center gap-2">
            <Mic className="animate-pulse size-5" />
            <span className="text-sm font-semibold">正在录制语音... {formatDuration(recordingDuration)}</span>
          </div>
          <Button size="sm" variant="destructive" onClick={stopRecording} className="h-8">
            <Square className="mr-1 size-3 fill-current" /> 停止
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <div className="flex items-center gap-1">
          {/* Image button */}
          <label className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full cursor-pointer transition-colors">
            <ImageIcon size={20} />
              <input
                type="file"
                className="hidden"
                accept="image/*"
                multiple
                onChange={(e) => handleFileUpload(e, "image")}
                disabled={uploading || isRecording}
                aria-label="上传图片"
              />
          </label>

          {/* Video button */}
          <label className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full cursor-pointer transition-colors">
            <Video size={20} />
              <input
                type="file"
                className="hidden"
                accept="video/mp4,video/webm"
                onChange={(e) => handleFileUpload(e, "video")}
                disabled={uploading || isRecording}
                aria-label="上传视频"
              />
          </label>

          {/* Mic button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`p-2 rounded-full transition-colors ${
              isRecording ? "text-red-500 bg-red-500/10 hover:bg-red-500/20" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            disabled={uploading}
            title={isRecording ? "停止录音" : "录制语音消息"}
          >
            <Mic size={20} />
          </button>
        </div>

        <Button onClick={handlePublish} disabled={loading || uploading || isRecording}>
          {(loading || uploading) && <Loader2 className="mr-2 animate-spin size-4" />}
          发布
        </Button>
      </div>
    </div>
  );
}
