# NEU Network Visualization

An interactive network visualization system for exploring research collaborations at Northeastern University.

This project enables multi-level exploration of academic collaboration networks, including scholars, research units, and cross-unit relationships through multiple coordinated views.

---

## Project Overview

This visualization system is designed to support:

- Exploration of collaboration structures across the institution
- Understanding clustering patterns and cross-unit connections
- Interactive analysis through multiple coordinated views and panels

The system integrates network data, view switching, and UI panels to provide a flexible and exploratory interface.

---

## Project Structure
project-root/
├── index.html
├── css/
│ └── style.css
├── data/
│ ├── scholars.js
│ ├── edges.js
│ ├── cluster_nodes.js
│ ├── cluster_edges.js
│ ├── cross_unit_edges.js
│ ├── scholar_detail.js
│ ├── summary.js
│ ├── topic_diversity.js
│ └── units.js
├── js/
│ ├── core/ # main logic, data handling, utilities
│ ├── drawer/ # network rendering logic
│ ├── views/ # different visualization modes
│ ├── left/ # left panel UI
│ ├── right/ # right panel UI
│ ├── search/ # search functionality


---

## How It Works

### 1. Data Layer (`data/`)
- Stores all network data including nodes, edges, clusters, and metadata
- Data is loaded into the system through core modules

### 2. Core Logic (`js/core/`)
- `main.js`: application entry point
- `datastore.js`: manages data loading and state
- `utils.js`: shared helper functions
- `panels.js`, `tooltip.js`: UI logic

### 3. Rendering Layer (`js/drawer/`)
- Responsible for drawing the network
- Multiple versions (`drawer_v1`, `v2`, `v3`) indicate iterative design

### 4. Views (`js/views/`)
- Different ways of exploring the network
- Includes cluster view and alternative layouts

### 5. UI Panels (`js/left/`, `js/right/`)
- Provide contextual information and controls
- Likely include filters, summaries, or details

### 6. Search (`js/search/`)
- Enables lookup of scholars or entities

---

## How to Run

This project runs in the browser.

### Option 1 (recommended)
Use a local server (e.g., VS Code Live Server)

### Option 2
Open `index.html` directly in the browser

---

## Key Features

- Multi-view network exploration
- Cluster-based visualization
- Cross-unit collaboration analysis
- Interactive panels (left/right)
- Search functionality
- Iterative rendering system (multiple drawer versions)

---

## Current Status

This project is under active iteration, focusing on:

- Improving rendering performance
- Refining interaction design
- Debugging and stabilizing view transitions
- Enhancing usability of panels and search

---

## Notes for Development

- Rendering logic is primarily located in `js/drawer/`
- Data flow is managed through `js/core/datastore.js`
- View switching logic is in `js/views/`
- UI behavior is split between `left/`, `right/`, and `core/panels.js`

---

## Author

Zhuoqi Liu  
MFA Information Design & Data Visualization  
Northeastern University

---

## Future Directions

- Integration with larger-scale network datasets
- Improved performance for large graphs
- Enhanced interaction (filtering, highlighting, storytelling)
- Deployment as an online interactive tool