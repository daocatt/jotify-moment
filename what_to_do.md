- 技术栈
    nextjs,tailwindcss+搭配shadcn,vite,react,drizzle-orm
    postgresql,R2/S3云上传支持,本地上传支持，上传组件
    lightbox,日历，缩略图能力，头像
    markdown，GFM支持
    lucide-icon
    注意所有必要组件的引用版本，禁止使用旧版本
    集成resend配置
    集成telegram配置

- 技术细节
    图片上传严格安全后缀和格式
    图片加密名称保存，分 年月 目录保存，例如 2020606/xxxx.jpg
    发文使用markdown，发布区域给简单的markdown编辑器能力
    允许发布语音
    允许上传视频mp4或者视频格式
    允许发布youtube视频链接自动嵌入

- 独立VPS部署，docker部署，+github自动部署

- UI
    配色要求，支持light和dark两种配色
    主题风格，模仿微信朋友圈风格，有顶图/头像/简介，名称，时间线日志，评论，reaction emojis选择框，限定5-8中react表情
    允许点赞
    图片禁止保存？

- 初始化超级管理员，允许添加多个管理员和普通用户，管理员可以进入admin控制台管理日志和用户，普通用户只能发布帖子
可以设置是否允许注册，是否必须发布审核
- resend用于注册/找回密码验证码
- telegrambot 用于集成发布，可以发布文字，发布图片，发布语音

开始规划和实现吧
