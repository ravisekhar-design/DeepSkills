<div align="center">

<img src="public/icon.png" alt="DeepSkills Logo" width="80" height="80" />

# DeepSkills Nexus

**Build, deploy, and orchestrate autonomous AI agents with pluggable skills.**

[![Next.js](https://img.shields.io/badge/Next.js_16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![LangChain](https://img.shields.io/badge/LangChain_DeepAgents-1E90FF?style=for-the-badge&logo=chainlink&logoColor=white)](https://docs.langchain.com/oss/javascript/deepagents/overview)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://prisma.io)
[![Vercel](https://img.shields.io/badge/Deployed_on_Vercel-000?style=for-the-badge&logo=vercel)](https://vercel.com)

[**Live Demo →**](https://deep-skills.vercel.app) &nbsp;·&nbsp; [Docs](https://docs.langchain.com/oss/javascript/deepagents/overview) &nbsp;·&nbsp; [Report a Bug](https://github.com/ravisekhar-design/DeepSkills/issues)

</div>

---

## What is DeepSkills?

DeepSkills Nexus is a full-stack platform for creating **LangChain Deep Agents** — AI agents that reason, plan, and act using a pipeline of specialized skills. Instead of building agents from scratch, you design them visually, assign skills, and export production-ready TypeScript code that follows the official [LangChain Deep Agents specification](https://docs.langchain.com/oss/javascript/deepagents/overview).

```
You describe the agent → DeepSkills generates the code → You deploy it
```

---

## Features

| | Feature | Description |
|---|---|---|
| 🧠 | **Agent Designer** | Create agents with custom personas, objectives, and cognitive parameters |
| ⚡ | **Skill Pipeline** | Two-panel selector: available modules on the left, active pipeline on the right |
| 🗄️ | **Data Sources** | Two-panel database selector: browse connections on the left, active sources on the right |
| 📁 | **Files & Folders** | Two-panel file context: expandable folder tree on the left, active context on the right |
| 💬 | **Live Chat** | Talk to your agents in real-time with full database query and file context support |
| 📊 | **Visual Dashboard Builder** | AI-powered + Manual chart builder with 18 chart types, drag-and-drop fields, and filters |
| 🔒 | **Secure Authentication** | Two-step OTP login via email, browser autofill support, 30-min idle timeout |
| 🔌 | **Multi-Provider AI** | Google, OpenAI, Anthropic, Groq, and Mistral — switch without code changes |
| 🗃️ | **Database Connections** | Connect PostgreSQL, MySQL, and more for agents to query live |
| 📦 | **Export-Ready Code** | Generated TypeScript matches the official `createDeepAgent()` pattern exactly |

---

## Authentication

### Two-Step OTP Login

Every login requires both a password and a one-time code sent to the user's registered email:

```
Step 1 — Email + Password  →  Step 2 — 6-digit OTP (10-min TTL)
```

- **Browser autofill compatible** — password managers fill credentials without any extra steps; values are captured via DOM refs and polled at 300 ms / 700 ms / 1500 ms
- **OTP bypass prevention** — the direct-password path in NextAuth throws when SMTP is configured, so the OTP step cannot be skipped programmatically
- **Step indicator** — shows `● — ○` progress dots; countdown timer turns red when under 60 seconds; resend button available
- **Session expiry** — JWT `maxAge` is 8 hours; sessions never persist past logout

### Idle Session Timeout

Authenticated users are automatically signed out after **30 minutes of inactivity**:

- A warning dialog appears **2 minutes before** the timeout with a live countdown
- Warning turns amber → red in the final 30 seconds
- "Stay signed in" resets the full 30-minute clock
- Tab-switch detection — returning to a tab that has been idle past the limit triggers immediate logout
- Redirects to `/login?reason=timeout` which shows a "Session expired" toast, then cleans the URL

### SMTP Configuration (Required for OTP)

Add these to your `.env` to enable two-factor login:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password    # use a Google App Password, not your account password
SMTP_FROM=your-email@gmail.com
```

> Each user who signs in receives their OTP at **their own registered email address** — the SMTP credentials are only used as the sender account.

If SMTP is not configured, direct password login is allowed (useful for local development).

---

## Agent Designer

### Two-Panel Selectors

The **Initialize Deep Agent** dialog uses a Tableau-style two-panel layout for all three resource tabs:

#### Skill Pipeline
| Left — Available Modules | Right — Active Pipeline |
|---|---|
| All skills with descriptions | Selected skills in execution order |
| Click to add / deselect | Drag ↑↓ to reorder, numbered steps |

#### Data Sources
| Left — Available Databases | Right — Connected Sources |
|---|---|
| All configured connections | Selected databases for this agent |
| Click to toggle | Hover to reveal × remove button |

#### Files & Folders
| Left — Folder Tree | Right — Active Context |
|---|---|
| Expandable folders with file counts | Selected folders (entire) and individual files |
| Folder-level checkbox (full/partial state) | Folder icon or file icon per item |
| Per-file checkbox — auto-upgrades to folder when all files selected | Hover to reveal × remove button |

### How File Selection Works

- **Select a folder** → all current and future files in that folder are included in agent context
- **Expand a folder** → pick individual files; files covered by a folder-level selection show "via folder"
- **All files in a folder checked** → automatically promoted to folder-level selection
- **Remove a folder** → switches to per-file selection for files already individually cached

---

## Visualize — Dashboard Builder

### 18 Chart Types

The Manual Builder supports every chart type via a grouped pill selector:

| Group | Chart Types |
|---|---|
| **Comparison** | Bar, Horizontal Bar, Stacked Bar, Waterfall |
| **Trend** | Line, Area |
| **Part-to-Whole** | Pie, Donut, Treemap |
| **Sequential** | Funnel |
| **Correlation** | Scatter, Bubble |
| **Multi-Metric** | Radar, Heatmap |
| **Progress** | Radial Bar, Gauge |
| **Advanced** | Composed (Bar + Line), Sankey |

#### New Chart Implementations

**Waterfall** — Cumulative gain/loss breakdown. Transparent offset bars create the floating effect; positive bars render in cyan, negative in red, with a zero reference line.

**Heatmap** — 2D color-intensity matrix. X axis = X-axis field; Y axis = Group By values; cell color interpolates from dark to accent. Includes a gradient legend and cell value labels.

**Bubble** — Three-dimensional scatter using X value, Y value, and bubble size. Maps `series[0]` → X, `series[1]` → Y, `series[2]` → size via Recharts `ZAxis`.

**Gauge** — Speedometer arc from min to max. Needle and colored arc update live; color transitions cyan → green → red across three threshold bands.

**Sankey** — Flow diagram between source and target node columns. Node heights scale with total flow; ribbon bezier paths with width proportional to flow value; source colors propagate through ribbons.

### Drag-and-Drop Field Assignment (Tableau-style)

```
Field Panel (left)                Configuration Zones (right)
┌────────────────────┐            ┌───────────────────────────────┐
│ 📐 DIMENSIONS       │  drag ──►  │  X-AXIS / CATEGORY  [drop]   │
│  ▢ name   text     │            │  [month  ×]                   │
│  ▢ region text     │            │                               │
│                    │            │  Y-AXIS / VALUES    [drop]    │
│ 📊 MEASURES         │  drag ──►  │  ● SUM(revenue) 🎨 SUM ▼ ×  │
│  ▣ revenue int     │            │  ● AVG(units)   🎨 AVG ▼ ×  │
│  ▣ units   int     │            │                               │
│                    │            │  GROUP BY           [drop]    │
│  Drag fields → →   │  drag ──►  │  [region ×]                   │
└────────────────────┘            └───────────────────────────────┘
```

- Fields are draggable `<div>` elements using native HTML5 drag API — no external library required
- Drop zones highlight with an accent border on hover
- Fallback `<Select>` dropdowns are always visible for keyboard/mouse-only users
- Dropping a column on the Y-axis zone adds it as a new measure (or replaces the empty placeholder)

### Color Picker per Series

Every measure row has a color swatch. Click it to open the browser's native color picker — supports any hex color. Colors persist in the saved chart config.

### Chart-Level Filters

A collapsible **Chart Filters** section is built into the Manual Builder:

```
column ▼   operator ▼   value      [×]
month      =            January    [×]
revenue    >            1000       [×]
region     contains     North      [×]
```

- **File sources** — filters applied *before aggregation* for accurate grouped totals
- **Database sources** — filters added as `WHERE` clause in generated SQL
- 10 operators: `=`, `≠`, `>`, `<`, `≥`, `≤`, `contains`, `not contains`, `is empty`, `not empty`
- Filter count badge shown on the section header and in the preview info bar

### Global Dashboard Filters

A **Filters** button in the dashboard header opens a filter bar that applies to **every chart simultaneously**:

- Filters are applied at render time to each chart's stored data — no re-fetch needed
- Column name is a free-text input (works across charts from different sources)
- Same 10 operators as chart-level filters
- Active filter count shown in the button badge; "Clear all" resets instantly
- Persists while navigating between charts on the same dashboard

### Additional Builder Options

| Option | What it does |
|---|---|
| **Sort order** | Default / Sort A→Z / Sort Z→A — applied to output data and SQL `ORDER BY` |
| **Data labels** | Toggle value labels on bars, lines, and area charts |
| **Grid width toggle** | Per-widget button (½ ↔ full width) — persisted via API |
| **Run Query** | Manual trigger for database sources; live auto-preview for file sources (debounced 250 ms) |

### AI Chart Generation

Describe any chart in plain English and the AI generates the configuration, SQL query (for databases), and data in one step:

```
"Show monthly revenue trend broken down by region as a stacked bar"
"Top 10 products by units sold, horizontal bar, sorted descending"
"Correlation between ad spend and conversions as a bubble chart"
```

Supports all 18 chart types. Uses your configured model from Settings → Model Mapping.

---

## Tech Stack

```
Frontend    Next.js 16 (App Router) · React 19 · Tailwind CSS · Radix UI · shadcn/ui
Charts      Recharts 2.13 (all chart types including custom SVG: Gauge, Heatmap, Sankey)
AI Runtime  LangChain Deep Agents · LangGraph · OpenAI · Anthropic · Google · Groq · Mistral
Backend     Next.js API Routes · Prisma ORM · PostgreSQL (Neon)
Auth        NextAuth.js v4 · Credentials Provider · JWT · Email OTP (Nodemailer)
Deployment  Vercel (serverless)
```

---

## Agent Architecture

Every agent generated by DeepSkills follows the official Deep Agents structure:

```typescript
// agent.ts — generated output
import { createDeepAgent } from 'deepagents';
import { web_search } from './skills/web_search/index';
import { weather }    from './skills/weather/index';

export const agent = createDeepAgent({
  tools: [web_search, weather],
  system: `You are a research assistant...`,
});

export async function chat(userMessage: string) {
  const result = await agent.invoke({
    messages: [{ role: 'user', content: userMessage }],
  });
  return result.messages.at(-1)?.content ?? '';
}
```

Each skill lives in its own directory with an implementation file and a `SKILL.md` manifest:

```
skills/
├── web_search/
│   ├── index.ts      ← tool() implementation
│   └── SKILL.md      ← frontmatter manifest (name, description, instructions)
└── weather/
    ├── index.ts
    └── SKILL.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database ([Neon](https://neon.tech) recommended — free tier)
- At least one AI provider API key (Google, OpenAI, Anthropic, Groq, or Mistral)

### 1. Clone & Install

```bash
git clone https://github.com/ravisekhar-design/DeepSkills.git
cd DeepSkills
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Database (PostgreSQL — Neon free tier works)
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# NextAuth
NEXTAUTH_SECRET="your-random-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# SMTP — required for two-factor OTP login
# (without this, direct password login is used — development only)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=your-email@gmail.com
```

> **AI provider keys** (OpenAI, Google, Anthropic, Groq, Mistral) are stored per-user in the database via **Settings → API Keys**. You do **not** need to add them to `.env`.

### 3. Set Up the Database

```bash
npx prisma db push      # push schema to your database
npx prisma generate     # generate Prisma client
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ravisekhar-design/DeepSkills)

1. Click **Deploy with Vercel** above
2. Add these environment variables in the Vercel dashboard:
   - `DATABASE_URL` — your Postgres connection string
   - `NEXTAUTH_SECRET` — a random 32-char string (`openssl rand -base64 32`)
   - `NEXTAUTH_URL` — your Vercel deployment URL
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — for OTP email
3. Deploy — Vercel auto-runs `prisma generate` on build

---

## How to Use

### 1. Create an Account
Register at `/register` with email and password. On first login, you will receive a 6-digit OTP at your registered email.

### 2. Add an API Key
Go to **Settings → API Keys** and paste your preferred provider's key. Set a default model for chat and for visualization.

### 3. Build Skills
Go to **Skills** and enable built-in skills or create custom ones. Each skill becomes a `tool()` the agent can invoke.

### 4. Create an Agent
Go to **Agents → Initialize Deep Agent**:
- Describe the agent's role (AI generates the persona)
- Set cognitive parameters (temperature, max tokens)
- **Skill Pipeline** — pick skills from the two-panel selector
- **Data Sources** — connect databases from the two-panel selector
- **Files & Folders** — select folders or individual files for document context

### 5. Chat & Export
- Click **Establish Link** to chat with the agent live
- The Intel panel shows active databases and file sources
- Click the **`<>`** code icon to view or edit the generated TypeScript code

### 6. Build Dashboards
Go to **Visualize**:
- Create a dashboard from the left panel
- Click **Add Chart** — choose a database table or uploaded CSV/JSON file
- Use **AI Describe** (natural language) or **Manual Builder** (drag-and-drop)
- Apply chart-level filters, pick colors, set sort order, toggle data labels
- Use **Global Filters** to filter all charts on the dashboard at once

---

## Project Structure

```
src/
├── ai/
│   ├── langchain.ts                  # getLangChainModel() — dynamic provider router
│   └── flows/
│       ├── agent-persona-generation.ts
│       └── chart-generation.ts       # AI chart config generation (18 chart types)
├── app/
│   ├── agents/page.tsx               # Agent designer — two-panel Skills/DB/Files selectors
│   ├── login/page.tsx                # Two-step OTP login with autofill support
│   ├── visualize/page.tsx            # Dashboard builder — global filters, grid toggle
│   ├── chat/page.tsx                 # Live chat interface
│   ├── skills/page.tsx               # Skill library + SKILL.md editor
│   ├── settings/page.tsx             # API keys, model selection
│   ├── databases/page.tsx            # Database connection manager + file storage
│   └── api/
│       ├── auth/                     # NextAuth, OTP send, OTP status endpoints
│       ├── dashboards/               # Dashboard + widget CRUD, schema introspection
│       └── files/                    # File folder/content API
├── components/
│   ├── auth-guard.tsx                # Session check + idle timeout warning overlay
│   ├── chart-renderer.tsx            # Renders all 18 chart types (Recharts + custom SVG)
│   ├── manual-chart-builder.tsx      # Drag-and-drop builder with filters and color picker
│   └── ui/
│       └── code-editor.tsx           # GitHub-style code editor component
├── hooks/
│   └── use-idle-timeout.ts           # 30-min idle logout hook with visibility detection
└── lib/
    ├── code-generator.ts             # Generates agent.ts + skill index.ts + SKILL.md
    ├── email.ts                      # Nodemailer SMTP utility for OTP emails
    └── store.ts                      # Client-side state + Prisma data types
```

---

## Supported AI Providers

| Provider | Models | Notes |
|---|---|---|
| **Google** | `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-2.5-pro` | Free tier available |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` | Paid, generous limits |
| **Anthropic** | `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5` | Paid |
| **Groq** | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` | Free tier, very fast |
| **Mistral** | `mistral-large-latest`, `mistral-small-latest` | Free tier available |

The system auto-detects which provider to use based on which API key is configured. No code changes needed to switch.

---

## Security

- **Passwords** hashed with bcrypt (never stored in plain text)
- **OTP codes** are single-use, expire after 10 minutes, and are deleted after first use
- **SQL injection prevention** — all DB queries use parameterized execution; manual builder escapes column names and filter values
- **Session hardening** — JWT `maxAge` set to 8 hours; idle timeout auto-signs out inactive users
- **OTP enforcement** — when SMTP is configured, the direct-password NextAuth path throws, making OTP non-bypassable

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you'd like to change.

```bash
# Development workflow
git checkout -b feature/my-feature
npm run dev
# make changes
npx tsc --noEmit   # verify zero TypeScript errors
git push origin feature/my-feature
# open a PR
```

---

## License

MIT © [ravisekhar-design](https://github.com/ravisekhar-design)

---

<div align="center">

Built with [LangChain Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/overview) · Deployed on [Vercel](https://vercel.com) · Powered by [Next.js](https://nextjs.org)

</div>
