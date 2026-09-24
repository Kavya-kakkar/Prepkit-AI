# PrepKit.ai — AI Interview Preparation Kit Generator

PrepKit.ai is a full-stack, monorepo-based platform designed to generate personalized, requirement-driven interview preparation kits from job descriptions (JDs) and company URLs. Built strictly according to the `TRAO FS-AI-INTERVIEW-01` specification, PrepKit.ai extracts job requirements, crawls live context, synthesizes company intelligence, and generates interactive questions, flashcards, and structured daily study schedules.

---

## 🛠️ Architecture Overview

The workspace is organized as a TypeScript monorepo containing frontend applications, API services, shared packages, and evaluation toolchains:

```text
├── apps/
│   ├── api/             # Express.js REST API service (LLM pipelines, web crawlers, job queues)
│   └── web/             # Frontend application UI
├── packages/            # Shared libraries, UI components, and TypeScript utilities
├── scripts/             # Evaluation, benchmark, and utility scripts
├── docs/                # Project documentation and specifications
├── vitest.config.ts     # Global test suite configuration
└── package.json         # Workspace root package configuration

✨ Features
LLM Requirement Extraction: Analyzes raw JDs and extracts key technical, domain, and behavioral requirements backed by verbatim evidence quotes.

Bounded Context Crawling: Fetches real-time company mission, culture, and technical stack details with strict time budgets.

Smart Interview Question Generation: Generates category-specific questions (Technical, System Design, Behavioral, Company Fit) tied directly to role requirements.

Iterative Gap Refill: Performs coverage pass checks to ensure all requirements are addressed by generated questions.

Spaced Repetition Flashcards: Automatically compiles key definitions and conceptual cards for quick review.

Automated Daily Schedules: Organizes preparation materials into a structured multi-day study plan.

🚀 Getting Started
Prerequisites
Node.js: v18.x or higher

npm or pnpm

Gemini API Key: Set in environment variables

Installation
Clone the repository:

Bash
git clone 
cd prepkit-ai
Install workspace dependencies:

Bash
npm install
Configure Environment Variables:
Create a .env file inside apps/api/.env:

Code snippet
PORT=3001
GEMINI_API_KEY=your_gemini_api_key_here
NODE_ENV=development
🧪 Development & Testing
Run backend services, frontend applications, and unit tests using npm workspace commands:

Start API Backend:

Bash
npm run dev --workspace=apps/api
Start Web Frontend:

Bash
npm run dev --workspace=apps/web
Run Test Suite:

Bash
npm test
📄 License
This project is licensed under the MIT License - see the LICENSE file for details.