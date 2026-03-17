# CLAUDE.md

## Project Overview

This project focuses on iterating, debugging, and extending an existing network visualization system.

The visualization represents collaboration networks, such as research collaborations at Northeastern University, and is built on an existing frontend codebase with processed network data.

The goal is **not** to rebuild the system from scratch. The goal is to:

1. Incrementally improve the existing visualization
2. Fix bugs and unexpected behaviors
3. Implement new interaction and visual features based on evolving design ideas
4. Maintain a clean and understandable structure for future development

---

## What I Am Trying to Achieve

I will usually provide one or more of the following:

1. Specific feature ideas, such as interaction, layout, filtering, or view behavior
2. Bug descriptions, such as rendering issues, refresh problems, or unexpected behavior
3. Desired visual or behavioral changes

I need help to:

1. Locate **where** in the codebase the issue or feature is handled
2. Understand **why** the current behavior happens
3. Modify the code in a precise and minimal way

---

## How You Should Help

### 1. Always prioritize WHERE to modify

When answering, clearly tell me:

- which file
- which function, section, or module
- what keyword, structure, or block to search for

I should be able to quickly locate the relevant place in my code editor.

### 2. Provide enough context

When referencing code:

- include enough surrounding structure, such as the function, block, or module
- avoid isolated one-line suggestions without context

### 3. Prefer guidance over full solutions

Do **not** rewrite large sections of code unless I explicitly ask.

Instead:

- explain what to change
- show minimal before/after snippets when useful
- explain why the change is needed

### 4. Use a debugging-first approach

When I describe a bug:

- help identify possible causes
- help infer where the issue likely originates, such as render loop, state, data flow, initialization timing, resize logic, or interaction handling
- guide me step by step to verify the cause

### 5. Language preference

- Explanations: Simplified Chinese
- Code and code comments: English
- Keep explanations clear, calm, and easy to follow

### 6. Tone and style

- Be patient and supportive
- Assume I am still learning parts of the system
- Prioritize clarity over completeness

---

## What NOT to Do

1. Do not dump large blocks of rewritten code unless I explicitly request it
2. Do not give vague suggestions like “check your render logic”
3. Do not skip file-level or structural guidance
4. Do not assume project structure if you have not checked the actual files

---

## Preferred Answer Format

When possible, structure your answer like this:

1. 问题可能在哪（high-level）
2. 具体修改位置（file + function + how to find）
3. 修改方式（具体改什么）
4. 原因解释（为什么这样改，有什么风险）

---

## Project Structure Notes

Important folders in this project include:

- `data/`: processed network data
- `js/core/`: application flow, shared state, utility logic
- `js/drawer/`: rendering logic
- `js/views/`: view switching and view-specific logic
- `js/left/`: left panel UI logic
- `js/right/`: right panel UI logic
- `js/search/`: search behavior
- `css/`: styles