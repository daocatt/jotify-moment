"use client";

import { useState } from "react";
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
import { updateProfileAction } from "@/app/actions/admin";
import { Camera, Loader2 } from "lucide-react";

interface ProfileEditModalProps {
  user: {
    name: string;
    bio: string | null;
    avatar: string | null;
    coverImage: string | null;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProfileEditModal({ user, isOpen, onClose, onSuccess }: ProfileEditModalProps) {
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || "");
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [coverImage, setCoverImage] = useState(user.coverImage || "");
  
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: "avatar" | "cover") => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict validation
    if (!file.type.startsWith("image/")) {
      toast.error("只能上传图片文件");
      return;
    }

    const setUploadProgress = target === "avatar" ? setUploadingAvatar : setUploadingCover;
    setUploadProgress(true);

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
        if (target === "avatar") {
          setAvatar(data.url);
        } else {
          setCoverImage(data.url);
        }
        toast.success("图片上传成功");
      }
    } catch {
      toast.error("上传图片失败");
    } finally {
      setUploadProgress(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("名字不能为空");
      return;
    }

    setLoading(true);
    const res = await updateProfileAction({
      name,
      bio,
      avatar,
      coverImage,
    });
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("个人资料已更新");
      onSuccess();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>编辑个人资料</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Cover image editor */}
          <div className="relative h-32 w-full bg-muted rounded overflow-hidden group">
            {coverImage ? (
              <img src={coverImage} alt="Cover" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
                无封面背景图
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
                onChange={(e) => handleFileUpload(e, "cover")}
                disabled={uploadingCover}
              />
            </label>
          </div>

          {/* Avatar editor */}
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 rounded-full overflow-hidden bg-muted group border border-border">
              {avatar ? (
                <img src={avatar} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground font-bold">
                  {name.charAt(0)}
                </div>
              )}
              <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white">
                {uploadingAvatar ? (
                  <Loader2 className="animate-spin size-4" />
                ) : (
                  <Camera size={14} />
                )}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, "avatar")}
                  disabled={uploadingAvatar}
                />
              </label>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">名字</label>
              <Input
                type="text"
                placeholder="您的展示名字"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">个性签名 / 简介</label>
            <Textarea
              placeholder="介绍一下你自己..."
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
  );
}
