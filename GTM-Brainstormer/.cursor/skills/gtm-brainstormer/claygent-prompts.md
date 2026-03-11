# Claygent LLM Prompt Templates

Guidelines and templates for creating effective Claygent prompts across different LLM providers. This document focuses on foundational components—research, signals, scoring, and data extraction.

> **Note**: Email personalization prompts are maintained in a separate skill. This document provides the building blocks that feed into personalization.

---

## Model-Specific Guidelines

### Claude (Anthropic)

**Best For:**
- Complex reasoning and nuanced analysis
- Long-context processing
- Multi-step research tasks
- Structured data extraction with validation

**Formatting Notes:**
- Supports XML tags for structure (`<context>`, `<task>`, `<output>`)
- Handles long inputs well (200K+ context)
- Excellent at following complex instructions
- Good at explaining reasoning

**Template Structure:**
```
<context>
You are a {role} analyzing {input_type} for {purpose}.
</context>

<input>
{clay_column_reference}
</input>

<task>
{specific_task_with_steps}
</task>

<output_format>
{structured_output_specification}
</output_format>
```

---

### ChatGPT (OpenAI)

**Best For:**
- General-purpose tasks
- JSON-structured outputs
- Quick extractions
- Conversational analysis

**Formatting Notes:**
- JSON mode available for structured output
- Good with system/user message separation
- Responds well to explicit formatting requests
- Keep instructions concise

**Template Structure:**
```
You are a {role}.

## Input
{clay_column_reference}

## Task
{specific_task}

## Output Format
Return a JSON object with these fields:
- field1: description
- field2: description
```

---

### Gemini (Google)

**Best For:**
- Fast processing
- Simple extractions
- Fact-based lookups
- Cost-effective bulk operations

**Formatting Notes:**
- Keep prompts concise and direct
- Avoid overly complex instructions
- Good for straightforward tasks
- Use clear delimiters

**Template Structure:**
```
Task: {specific_task}

Input: {clay_column_reference}

Extract the following:
1. {field1}
2. {field2}

Format: {output_format}
```

---

## Foundational Component Prompts

### 1. Company Research Prompt

**Purpose:** Deep company analysis for enrichment

**Claude Version:**
```xml
<context>
You are a B2B market research analyst specializing in company intelligence.
</context>

<input>
Company Name: {{company_name}}
Website: {{company_website}}
</input>

<task>
Research this company and extract:
1. Business model (how they make money)
2. Target customer segments
3. Key products/services
4. Estimated company stage (startup/growth/enterprise)
5. Recent news or developments (if available)
6. Potential pain points based on their business
</task>

<output_format>
Return as structured data:
- business_model: string
- target_segments: array of strings
- products: array of strings
- company_stage: startup | growth | enterprise
- recent_news: string or null
- potential_pain_points: array of strings
</output_format>
```

**ChatGPT Version:**
```
You are a B2B market research analyst.

## Input
Company: {{company_name}}
Website: {{company_website}}

## Task
Analyze this company and extract key intelligence.

## Output (JSON)
{
  "business_model": "",
  "target_segments": [],
  "products": [],
  "company_stage": "startup|growth|enterprise",
  "recent_news": "",
  "potential_pain_points": []
}
```

---

### 2. LinkedIn Profile Analysis Prompt

**Purpose:** Extract insights from LinkedIn profiles for qualification

**Claude Version:**
```xml
<context>
You are analyzing a LinkedIn profile to understand the person's role, responsibilities, and potential needs.
</context>

<input>
LinkedIn Profile Data:
{{linkedin_profile_data}}
</input>

<task>
Analyze this profile and determine:
1. Current role and seniority level
2. Key responsibilities (inferred from title and experience)
3. Decision-making authority (low/medium/high)
4. Likely priorities based on role
5. Potential conversation starters based on their background
</task>

<output_format>
- role: string
- seniority: junior | mid | senior | executive
- responsibilities: array of strings
- decision_authority: low | medium | high
- likely_priorities: array of strings
- conversation_starters: array of strings
</output_format>
```

---

### 3. Signal Detection Prompt

**Purpose:** Identify buying signals from company data

**Claude Version:**
```xml
<context>
You are a GTM signal analyst identifying buying indicators from company data.
</context>

<input>
Company Data:
{{company_data}}

Recent Activity:
{{recent_activity}}
</input>

<task>
Analyze this data for buying signals:
1. Identify all present signals (funding, hiring, tech changes, etc.)
2. Rate signal strength (weak/moderate/strong)
3. Estimate timing urgency (immediate/near-term/long-term)
4. Suggest the best signal to lead with
</task>

<output_format>
- signals_detected: array of {signal_type, strength, evidence}
- timing_urgency: immediate | near_term | long_term
- recommended_lead_signal: string
- confidence_score: 1-10
</output_format>
```

---

### 4. ICP Matching Prompt

**Purpose:** Score how well a company matches ideal customer profile

**Claude Version:**
```xml
<context>
You are scoring companies against an Ideal Customer Profile (ICP).
</context>

<input>
Company Data:
{{company_data}}

ICP Criteria:
- Industry: {{target_industries}}
- Company Size: {{target_size}}
- Tech Stack: {{target_tech}}
- Growth Signals: {{target_signals}}
- Geography: {{target_geo}}
</input>

<task>
Score this company against each ICP criterion:
1. Evaluate match for each criterion (0-100)
2. Calculate overall ICP fit score
3. Identify strongest match factors
4. Identify disqualifying factors (if any)
5. Provide recommendation (pursue/nurture/disqualify)
</task>

<output_format>
- criteria_scores: {industry: int, size: int, tech: int, signals: int, geo: int}
- overall_score: int (0-100)
- match_factors: array of strings
- disqualifiers: array of strings or empty
- recommendation: pursue | nurture | disqualify
- reasoning: string
</output_format>
```

---

### 5. Data Enrichment & Extraction Prompt

**Purpose:** Extract and structure data from unstructured sources

**Claude Version:**
```xml
<context>
You are a data extraction specialist parsing unstructured text into structured data.
</context>

<input>
Raw Data:
{{raw_data}}

Source Type: {{source_type}}
</input>

<task>
Extract the following fields from this data:
{{fields_to_extract}}

Rules:
- If a field is not found, return null
- If multiple values exist, return as array
- Normalize formats (dates, phone numbers, etc.)
- Flag low-confidence extractions
</task>

<output_format>
{
  "extracted_fields": {
    "field1": value or null,
    "field2": value or null
  },
  "confidence": {
    "field1": high | medium | low,
    "field2": high | medium | low
  },
  "extraction_notes": "any issues or ambiguities"
}
</output_format>
```

---

### 6. Competitive Intelligence Prompt

**Purpose:** Analyze competitive positioning from company data

**Claude Version:**
```xml
<context>
You are a competitive intelligence analyst evaluating a prospect's current vendor relationships.
</context>

<input>
Company: {{company_name}}
Tech Stack: {{tech_stack}}
Our Product Category: {{our_category}}
Known Competitors: {{competitor_list}}
</input>

<task>
Analyze competitive positioning:
1. Identify current solutions in our category
2. Assess likely satisfaction level (based on tenure, integrations)
3. Identify potential switching triggers
4. Rate competitive displacement opportunity
5. Suggest differentiation angles
</task>

<output_format>
- current_solutions: array of {vendor, category, tenure_estimate}
- satisfaction_assessment: satisfied | neutral | dissatisfied | unknown
- switching_triggers: array of strings
- displacement_opportunity: low | medium | high
- differentiation_angles: array of strings
</output_format>
```

---

## Error Handling Patterns

### Graceful Fallbacks

```xml
<error_handling>
If you cannot complete the task:
1. Return partial data with confidence flags
2. Explain what information is missing
3. Suggest alternative data sources
4. Never hallucinate data—use null for unknowns
</error_handling>
```

### Validation Rules

```xml
<validation>
Before returning output:
1. Verify all required fields are present
2. Check data types match specification
3. Validate any URLs or emails
4. Ensure arrays are not empty strings
5. Confirm confidence scores are justified
</validation>
```

---

## Clay-Specific Patterns

### Referencing Clay Columns

Use double curly braces for Clay column references:
- `{{company_name}}` - Company name column
- `{{linkedin_url}}` - LinkedIn URL column
- `{{enriched_data.field}}` - Nested field from enrichment

### Output for Clay Tables

When output goes back to Clay:
1. Keep field names snake_case
2. Return single values for single columns
3. Return arrays only when Clay column expects them
4. Use consistent data types across rows

### Handling Empty Inputs

```
If {{company_website}} is empty or invalid:
- Return: {"error": "missing_required_input", "field": "company_website"}
- Do not attempt to guess or search
```

---

## Prompt Optimization Tips

1. **Be Specific**: Vague prompts produce vague results
2. **Show Examples**: Include 1-2 examples of expected output
3. **Set Boundaries**: Tell the model what NOT to do
4. **Request Confidence**: Ask for confidence scores on extractions
5. **Handle Edge Cases**: Explicitly address what to do with missing data
6. **Test with Real Data**: Validate prompts against actual Clay inputs
7. **Iterate**: Start simple, add complexity based on failure modes
