"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { initializeSystemAction } from "@/app/actions/init";
import { Loader2 } from "lucide-react";

export default function InitPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // Prevent any browser extension auto-fill during SSR / Hydration
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!name || !email || !password) {
      toast.error("请填写完整表单项");
      return;
    }

    if (password.length < 8) {
      toast.error("密码长度至少为 8 位");
      return;
    }

    setLoading(true);
    const res = await initializeSystemAction({ name, email, password });
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("系统初始化成功！超级管理员已成功创建。");
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-card p-6 border border-border shadow-sm">
        <div className="mb-6 space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground">初始化系统</h1>
          <p className="text-xs text-muted-foreground">
            请设定并创建第一个超级管理员账号以完成初始化。
          </p>
        </div>

        {!mounted ? (
          // Temporary placeholder during hydration
          <div className="space-y-4 py-10 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-muted-foreground size-6" />
            <span className="text-xs text-muted-foreground">正在初始化表单环境...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off" data-1password-ignore="true">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">管理员昵称</label>
              <Input
                type="text"
                placeholder="例如：管理员"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
                autoComplete="off"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">管理员邮箱</label>
              <Input
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="off"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">管理员密码</label>
              <Input
                type="password"
                placeholder="至少 8 位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete="new-password"
                minLength={8}
              />
            </div>

            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading ? <Loader2 className="animate-spin mr-2 size-4" /> : null}
              {loading ? "正在创建..." : "完成初始化并创建管理员"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
