# 奖状图片目录

把奖状照片（jpg/png）放进这个目录，然后在 `index.html` 对应的「查看奖状」按钮上加上 `data-slug` 属性即可显示，例如：

```html
<button class="btn btn-small award-btn" data-title="物理创新实验制作 · 一等奖"
        data-slug="honor-physics-exp">查看奖状</button>
```

约定：
- 单张奖状用 `assets/awards/<slug>.jpg`，按钮加 `data-slug="<slug>"`。
- 多张独立奖状用 `data-slugs="slug-a,slug-b"`（逗号分隔），图片分别为 `slug-a.jpg`、`slug-b.jpg`。

## 当前图片清单

### AI 认证
| slug | 内容 |
| --- | --- |
| `ai-rag` | 科大讯飞 · RAG 工程师 |
| `ai-prompt` | 科大讯飞 · Prompt 工程师 |
| `ai-tuning` | 科大讯飞 · 微调工程师 |
| `ai-agent` | 科大讯飞 · 智能体工程师 |
| `ai-trainer-junior` | 达摩院 · 人工智能训练师（初级） |
| `ai-trainer-advanced` | 达摩院 · 人工智能训练师（高级） |
| `ai-coding` | Datawhale × 豆包 MarsCode · AI + 编程能力认证 |

### 传统奖项
| slug | 内容 |
| --- | --- |
| `honor-integrity-city` | 《扣紧诚信扣，点亮人生路》· 湛江市高中组优秀作品奖（市级） |
| `honor-running-city` | 《奔跑人生》· "我运动，我快乐"市征文三等奖 |
| `honor-running-school` | "我运动，我快乐"校征文 · 高中组一等奖 |
| `honor-cadre-2324` | 优秀团干 · 2023-2024 学年度五四评优 |
| `honor-cadre-2425` | 优秀团干 · 2024-2025 学年度五四评优 |
| `honor-physics-exp` | 物理创新实验制作竞赛 · 一等奖 |
| `honor-math-model` | "科技城市·未来家园"数学立体模型制作 · 一等奖 |
| `honor-english-dubbing` | 第三届英语配音大赛决赛 · 二等奖 |
