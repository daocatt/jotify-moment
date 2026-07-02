# Caddy 配置 - 自定义域名与 On-Demand TLS

用户绑定独立域名后，Caddy 自动申请 SSL 证书。申请前通过后端 API 校验域名是否已注册。

## .env 配置

```env
CADDY_ASK_TOKEN=your_secure_random_token_here
MAIN_HOST=jotify-moment.com,www.jotify-moment.com
```

## Caddyfile

```caddy
{
    on_demand_tls {
        ask "http://127.0.0.1:3000/api/domains/check?token=your_secure_random_token_here"
        interval 2m
        burst 5
    }
}

:443 {
    tls {
        on_demand
    }
    reverse_proxy 127.0.0.1:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}

:80 {
    redir https://{host}{uri}
}
```

> Docker 同网络部署时，将 `127.0.0.1:3000` 改为容器名如 `web:3000`。

## 工作流程

1. 用户将域名 CNAME 解析到主站
2. 访问时 Caddy 调用 `ask` 接口校验域名
3. 校验通过 → 自动申请证书；校验失败 → 拒绝握手

## 注意事项

- **务必配置 `ask`**，否则任何解析到本机的域名都会触发证书申请，耗尽 Let's Encrypt 配额
- 建议用户使用 CNAME 而非 A 记录，避免 IP 变更后域名失效
