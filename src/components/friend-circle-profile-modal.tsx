"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { updateFriendCircleProfileAction } from "@/app/actions/admin";
import { Camera, Loader2 } from "lucide-react";
import { ImageCropModal } from "@/components/image-crop-modal";

interface FriendCircleProfileModalProps {
  user: {
    name: string;
    avatar: string | null;
    coverImage: string | null;
    bio: string | null;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function FriendCircleProfileModal({ user, isOpen, onClose, onSuccess }: FriendCircleProfileModalProps) {
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || "");
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [coverImage, setCoverImage] = useState(user.coverImage || "");

  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<"avatar" | "cover">("avatar");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: "avatar" | "cover") => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("只能上传图片文件");
      return;
    }
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setCropTarget(target);
  };

  const handleCropConfirm = useCallback(async (croppedBlob: Blob) => {
    const setUploadProgress = cropTarget === "avatar" ? setUploadingAvatar : setUploadingCover;
    setUploadProgress(true);

    const file = new File([croppedBlob], `crop_${cropTarget}.jpg`, { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload?biz=profile", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        if (cropTarget === "avatar") setAvatar(data.url);
        else setCoverImage(data.url);
        toast.success("图片上传成功");
      }
    } catch {
      toast.error("上传图片失败");
    } finally {
      setUploadProgress(false);
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    }
  }, [cropTarget, cropSrc]);

  const handleCropCancel = useCallback(() => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }, [cropSrc]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("朋友圈标题不能为空");
      return;
    }

    setLoading(true);
    const res = await updateFriendCircleProfileAction({ name, bio, avatar, coverImage });
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("好友圈资料已更新");
      onSuccess();
      onClose();
    }
  };

  return (
    <>
      <ImageCropModal
        isOpen={!!cropSrc}
        imageSrc={cropSrc}
        aspect={cropTarget === "cover" ? 1.8 : 1}
        title={cropTarget === "cover" ? "裁剪背景图 (1.8:1)" : "裁剪朋友圈 Logo (1:1)"}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />

      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>朋友圈资料</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-1">
            <div className="relative h-32 w-full bg-muted rounded overflow-hidden group">
              {coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverImage} alt="Cover" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
                  无背景图
                </div>
              )}
              <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white">
                {uploadingCover ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <Camera size={20} />
                    <span className="text-xs">更换背景</span>
                  </div>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => handleFileSelect(e, "cover")}
                  disabled={uploadingCover}
                />
              </label>
            </div>

            <div className="flex items-start gap-4">
              <div className="relative h-16 w-16 rounded-full overflow-hidden bg-muted group border border-border shrink-0">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground font-medium text-lg">
                    {name.charAt(0)}
                  </div>
                )}
                <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white">
                  {uploadingAvatar ? <Loader2 className="animate-spin size-4" /> : <Camera size={14} />}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => handleFileSelect(e, "avatar")}
                    disabled={uploadingAvatar}
                  />
                </label>
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-normal text-muted-foreground">朋友圈标题</label>
                <Input
                  type="text"
                  placeholder="例如：某某的好友圈"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-normal text-muted-foreground">朋友圈描述</label>
              <Textarea
                placeholder="介绍一下这个好友圈..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                取消
              </Button>
              <Button type="submit" disabled={loading || uploadingAvatar || uploadingCover}>
                {loading && <Loader2 className="mr-2 animate-spin size-4" />}
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
