# 圣地巡礼拼图

静态图片拼接工具。Mac 上用浏览器打开 `index.html`；iPhone 上打开自己部署的 HTTPS 网页并添加到主屏幕。两端共用同一份代码。

图片只在本机浏览器中处理，不上传。程序无需账号、后端或第三方 API，也不依赖特定托管平台。GitHub 源码仓库可继续保持私有。

## 使用

1. 选择动画截图或漫画图片，框选需要对比的区域；拖动选区和四角可调整裁切。
2. 选择实景照片，在等比例的框中拖动，用滚轮、双指或滑杆缩放。
3. 选择动画图的位置、边框和分隔线。
4. 下载 PNG/JPEG；支持文件分享的浏览器也可使用“分享 JPEG”。

“适合分享”会将导出长边限制在 4096 px、总像素限制在 1200 万以内；“原始尺寸”按动画图裁切像素导出。

## iPhone

在 Safari 中打开自己部署的 HTTPS 地址，点“分享”→“添加到主屏幕”。选择照片后可直接编辑、导出。首次在线加载后会缓存程序文件，图片和编辑进度不会持久保存。真实 iPhone 的选图、双指缩放和分享仍需实机确认。

手机访问地址需要能访问到托管主机。局域网地址仅在对应网络内可用；完整离线缓存与系统分享需要 HTTPS。

## 构建和托管

运行 `bash build-static.sh`，将 `dist/` 内的文件放到静态网页服务器。发布包不包含 `.git`、照片或账号信息。

- **GitHub Pages**：同一个仓库即可。私有仓库使用 Pages 需要 GitHub Pro、Team 或 Enterprise 等支持该功能的方案。网站访问权限与仓库权限分开配置，无需公开源码仓库。
- **NAS**：将 `dist/` 内容放进 NAS 的网页服务目录，按 NAS 的网页服务配置 HTTPS 地址。NAS 只提供网页文件，图片处理仍由手机或电脑浏览器完成。

托管只维护构建副本，源码仍维护在原来的一个 GitHub 仓库中。`dist/` 和 `releases/` 不纳入 Git。

## GitHub Pages 部署

网页可以直接从同一个私有仓库的 `main` 分支根目录发布，不需要额外的构建工作流。

1. 打开仓库的 [Settings → Pages](https://github.com/daikichiyama-observatory/seichi-collage/settings/pages)。
2. 在 **Build and deployment → Source** 中选择 **Deploy from a branch**。
3. 在 **Branch** 中选择 **main**、**/(root)**，点 **Save**。
4. 等待 GitHub 显示已发布地址，再在 iPhone Safari 中打开；如果提供 **Enforce HTTPS** 选项，请保持开启。

此后推送到 `main` 会自动更新网页。根目录中的 `.nojekyll` 让 GitHub 直接提供现有 HTML、JS 和图片文件。

如果 Pages 设置页提示升级方案，说明当前方案不能从私有仓库发布 Pages；保持仓库私有，使用支持该功能的方案或 NAS 部署。

## 格式与画质

导入后会显示浏览器实际收到的图片尺寸和大小。Mac“照片”直接拖入网页如果只得到小图，可先拖到访达，再把文件拖入网页。

支持浏览器能够解码的 JPEG、PNG、WebP、HEIC/HEIF 和 TIFF；具体支持取决于浏览器。暂不支持 GIF 动画、视频及透视校正。
