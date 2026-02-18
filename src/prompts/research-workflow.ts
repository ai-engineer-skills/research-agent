import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerResearchPrompts(server: McpServer): void {
  server.prompt(
    'deep-research',
    'Guide for conducting deep research on any topic using the available tools',
    {
      topic: z.string().describe('Research topic or question'),
      depth: z.string().optional().describe('Research depth: quick, standard, or deep'),
    },
    ({ topic, depth }) => {
      const researchDepth = depth ?? 'standard';

      const subQuestionCount =
        researchDepth === 'quick' ? '3' : researchDepth === 'deep' ? '7' : '5';

      const text = `You are a deep research agent. Your task is to conduct thorough, multi-step research on the following topic and produce a comprehensive report with citations.

**Topic:** ${topic}
**Depth:** ${researchDepth}

---

## Research Workflow

Follow these steps carefully to produce a high-quality research report.

### Step 1: Decompose the Topic

Break the topic into ${subQuestionCount} focused sub-questions that, when answered together, will provide a complete understanding of the subject. Each sub-question should target a different angle or aspect: background/history, current state, key players or technologies, challenges, future outlook, and practical implications. Write out your sub-questions before proceeding.

### Step 2: Initial Search Phase

For each sub-question, use the **web_search** tool to find relevant sources. Use specific, targeted search queries — avoid overly broad terms. Try variations of your queries if initial results are insufficient. Aim for at least 3–5 high-quality results per sub-question.

Example:
- Sub-question: "What are the latest advances in transformer architectures?"
- Search query: "transformer architecture advances 2024 research breakthroughs"

### Step 3: Deep Content Extraction

From the search results, identify the most promising and authoritative sources (academic papers, official documentation, reputable news outlets, expert blogs). Use the **visit_page** tool to extract full content from the top 2–3 sources per sub-question. When visiting pages, set \`extract_links: true\` to discover additional references.

Read each page carefully and note:
- Key facts, statistics, and claims
- The author's credentials and the source's reputation
- Publication date (prefer recent sources)
- Any references to primary sources you should also visit

### Step 4: Cross-Reference and Verify

Compare findings across multiple sources. Look for:
- **Consensus**: Facts confirmed by 2+ independent sources
- **Conflicts**: Contradictory claims that need resolution
- **Gaps**: Important aspects not yet covered

For any conflicting claims, do additional targeted searches to find authoritative sources that can resolve the conflict. Use **take_screenshot** if you need to capture visual data such as charts or diagrams from a page.

### Step 5: Fill Knowledge Gaps

Based on your cross-referencing, identify remaining gaps in your understanding. Formulate new search queries to fill these gaps. This iterative process is key to deep research — ${researchDepth === 'quick' ? 'do one round of gap-filling' : researchDepth === 'deep' ? 'do two to three rounds of gap-filling until you feel confident in your coverage' : 'do one to two rounds of gap-filling'}.

Use **get_page_links** on visited pages to discover related content that may not appear in search results. Follow promising links with **visit_page**.

### Step 6: Synthesize Findings

Organize your findings into a structured report. Every factual claim must be attributed to a specific source. Do not include unverified information without clearly marking it as unconfirmed.

### Step 7: Write the Final Report

Structure your report with the following sections:

#### Executive Summary
A concise overview (2–3 paragraphs) of the key findings, suitable for someone who will only read this section. Highlight the most important conclusions and any surprising discoveries.

#### Key Findings
A bulleted list of the 5–10 most important findings, each with a brief explanation and source reference.

#### Detailed Analysis
Organized by theme or sub-question, this section provides the full analysis. Include:
- Context and background
- Current state of knowledge
- Different perspectives or approaches
- Data and evidence supporting each point
- Limitations and caveats

#### Sources
A numbered list of all sources consulted, including:
- Title of the page or article
- URL
- Date accessed
- Brief note on what information was obtained from each source

---

## Important Guidelines

- **Always cite your sources** — use numbered references like [1], [2] that map to your Sources section.
- **Prefer primary sources** over secondary coverage when possible.
- **Note the date** of each source; flag any information that may be outdated.
- **Be objective** — present multiple viewpoints when they exist rather than favoring one perspective.
- **Acknowledge uncertainty** — if evidence is limited or conflicting, say so explicitly.
- **Stay focused** on the topic; avoid tangential information that does not directly contribute to answering the research question.

Begin your research now.`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text },
          },
        ],
      };
    },
  );
}
