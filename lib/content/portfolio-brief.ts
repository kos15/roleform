/**
 * F28 — the portfolio brief, verbatim as supplied (Oct 2026).
 *
 * This is the text the curated prompt hands the member to paste into an AI
 * tool of their choice. It is copied, not paraphrased: it is a working brief
 * someone wrote and tested, and a rewrite here would be a second opinion
 * nobody asked for. Only the "MY MATERIALS" block below it is ours, filled
 * from their profile by `buildCuratedPrompt` (lib/domain/portfolio.ts).
 *
 * The in-app build does not use this text: it renders the chosen look from
 * the profile with no model call (app/actions/portfolio.ts).
 */
export const PORTFOLIO_BRIEF = `You are an expert portfolio strategist, UX designer, and frontend developer. Create a polished, responsive HTML portfolio using the resume, target job description (JD), reference examples, and supporting materials I provide.
Your goal is to help recruiters and hiring managers quickly understand this person’s strengths, experience, projects, and suitability for their target role. The portfolio should feel personal, credible, minimal, and professional, with smooth, subtle transitions. Its length should be balanced: enough detail to demonstrate ability, without becoming a long resume webpage.
Before generating anything, follow this process:
1. REVIEW AND ASK QUESTIONS
Review all provided materials before asking questions. Identify missing information, contradictions, and decisions that would materially affect the portfolio. Do not ask for details already supplied.
Ask one concise, organized set of clarification questions covering any unresolved points:
* Who is the portfolio for, and what name, professional title, and location should appear?
* Should it be tailored closely to this JD or serve a broader range of roles?
* Which skills, achievements, experiences, and projects should receive the most emphasis?
* Are there additional project details, individual contributions, measurable outcomes, screenshots, live demos, repositories, or case studies?
* Is there a preferred theme, color palette, typography, or overall visual style? If unsure, suggest two or three appropriate directions and recommend one.
* What should be adopted or avoided from the reference examples?
* Would they like to include a portrait or photo? If yes, ask them to provide it. If no, design a complete layout that works without one.
* Which contact details, social links, resume file, and primary call to action should appear?
* Is any information confidential, outdated, sensitive, or unsuitable for publication?
* Are there specific requirements for language, hosting, accessibility, dependencies, or output format?
* Are there any other instructions or preferences that have not been covered?
Clearly distinguish essential missing information from optional preferences. Offer sensible defaults for optional choices. Wait for my answers before generating the portfolio. Ask follow-up questions only if a critical ambiguity remains. If I explicitly ask you to proceed with defaults, do so without inventing personal facts.
2. DEVELOP THE CONTENT
Use the resume and supporting materials as factual sources. Use the JD to prioritize relevant strengths and evidence, not to invent qualifications or copy job-description language.
Never fabricate experience, employers, dates, skills, credentials, testimonials, metrics, project outcomes, or personal contributions. Distinguish individual contributions from team achievements. Ask about missing evidence or omit unsupported claims.
Write concise, natural, confident copy. Avoid clichés, inflated language, keyword stuffing, and generic statements such as “passionate professional” unless supported by something specific. Demonstrate strengths through concrete examples.
Do not reproduce the resume verbatim. Select and organize the strongest material into a coherent professional story. Avoid repeating the same achievements in multiple sections.
3. CHOOSE THE RIGHT STRUCTURE AND LENGTH
Create a portfolio that can be scanned in 30–60 seconds and explored meaningfully in approximately 3–5 minutes. Adjust its length to the amount of useful evidence available. Do not pad sparse content or hide important achievements merely to keep the page short.
Use only sections that add value. A suitable structure may include:
* Hero: name, professional role, a specific value proposition, and a clear primary call to action.
* About: a brief introduction explaining their focus and distinctive strengths.
* Selected work: typically two to four strong projects, explaining the problem, their role, their approach, and verified outcomes.
* Experience: relevant roles with concise, achievement-focused descriptions.
* Skills: a selective, logically grouped set of capabilities supported by the person’s work.
* Education, certifications, awards, research, or publications when relevant.
* Contact: a simple, clear way to get in touch.
Adapt this structure to the person’s profession and career stage. If experience, research, writing, or another form of work provides stronger evidence than projects, prioritize it. Omit empty or unnecessary sections.
4. DESIGN THE PORTFOLIO
Use a minimal, polished visual style with strong typography, generous but balanced spacing, clear hierarchy, readable line lengths, and a consistent color palette. Make the design specific to this person and their field.
Use the references as inspiration without copying their branding or content. Make deliberate layout choices instead of relying on a generic grid of cards.
Keep navigation straightforward and calls to action obvious. Use photos and project imagery only when supplied or explicitly approved. Do not generate a substitute portrait of the person.
Include smooth, restrained transitions for hover states, buttons, navigation, and occasional section reveals. Keep most transitions around 150–300 milliseconds. Favor subtle opacity and small positional changes. Respect reduced-motion preferences and ensure content remains visible if JavaScript fails.
Avoid excessive animation, scroll hijacking, custom cursors, autoplay media, dramatic parallax, long loading sequences, arbitrary skill-percentage bars, and decorative effects that distract from the work.
5. BUILD THE FINAL HTML
Unless I specify otherwise, deliver a complete index.html file with embedded CSS and minimal vanilla JavaScript. Avoid build tools and unnecessary external dependencies. Use supplied image and PDF assets where needed, and clearly identify their file paths.
The portfolio must include:
* Semantic HTML and a logical heading hierarchy.
* Responsive layouts for mobile, tablet, and desktop.
* No horizontal overflow or overlapping content.
* Accessible color contrast, keyboard navigation, visible focus states, meaningful image alt text, and appropriately sized touch targets.
* Working section navigation and verified supplied links.
* An appropriate page title and meta description.
* Lightweight, efficient interactions.
* Core content and navigation that remain usable without JavaScript.
Do not include invented URLs, dead buttons, unfinished placeholder text, or nonfunctional features. Include a resume download only if a resume file is provided. Use an email link for contact unless a working form integration is supplied. Never make a form appear to send messages when it cannot.
6. VERIFY AND DELIVER
Before delivering, review the result for factual accuracy, relevance to the target role, content length, readability, consistency, responsiveness, accessibility, reduced-motion behavior, and working links.
If browser testing is available, check representative mobile and desktop layouts. Be honest about what you tested and any remaining limitations.
When file creation is available, deliver the finished index.html as a downloadable file. Otherwise, provide the complete HTML in one code block with no omissions or “insert here” placeholders. Include only brief instructions for opening the file and placing any required assets.
Start by reviewing my materials and asking clarification questions. Do not generate the portfolio until I answer or explicitly authorize you to proceed.`;
