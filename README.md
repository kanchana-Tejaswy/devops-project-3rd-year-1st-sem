# Smart Queue — Smart Queue Token Management System

A production-grade, lightweight, and responsive **Smart Queue Token Management System** engineered for college administrative offices, fee payment counters, examination divisions, and laboratory desks. Built entirely with **Vanilla JavaScript (HTML5, CSS3, JS)**, browser **LocalStorage**, **Docker with Nginx**, and automated **GitHub Actions CI**.

---

## 1. Project Overview & Real-World Use Case

### The Problem
Educational institutions, administrative counters, and student service centers frequently encounter bottlenecked physical lines. Congestion leads to lost service order, student frustration, overcrowding at counter windows, and lack of operational transparency for department supervisors.

### The Solution
**Smart Queue** solves this by providing a unified, multi-department digital queue kiosk:
1. **Visitors** select their department, specify their request purpose, and generate an instant sequential queue token (e.g., `A001`, `F001`, `L001`).
2. **Visitors** can monitor the live queue progress, see how many people are ahead, print or save their ticket slip, and receive visual and auditory alerts when summoned.
3. **Desk Administrators** can call next waiting visitors in strict FIFO order, mark service as completed, void no-shows, and view real-time department performance metrics.
4. **Public Waiting Room Displays** present a high-visibility, digital billboard indicating current active numbers across all campus counters.

---

## 2. Key Features

### A. Visitor Dashboard & Kiosk
- **One-Click Token Generation:** Generates sequential tokens assigned to specific service counters.
- **Sequential Prefixing:**
  - `A001`, `A002`, `A003`... for **Administration Office**
  - `F001`, `F002`, `F003`... for **Fee Payment Counter**
  - `L001`, `L002`, `L003`... for **Laboratory Support**
- **Prominent Ticket Slip:** Renders a realistic ticket pass featuring the token number, counter location, issue timestamp, purpose, and live status badge.
- **Live Turn Tracking:** Dynamically calculates how many visitors are ahead (`"You are next in line!"` or `"X people ahead of you"`).
- **Audio Chime:** Synthesizes an airport/counter announcement bell tone via the Web Audio API when a visitor's token is called.
- **Slip Actions:** Print ticket slip (`window.print()` formatted for receipts) or cancel token.

### B. Administrator Counter Desk
- **Sequential Queue Advancement:** "Call Next Token" button promotes the oldest waiting visitor to the counter.
- **Single-Server Concurrency Control:** Guards against calling multiple visitors simultaneously to prevent counter conflicts.
- **Service Lifecycle:** Transitions tokens through `Waiting` ➔ `Serving` ➔ `Completed` or `Cancelled`.
- **Cancellation with Audit Trail:** Allows canceling waiting tokens with status recording.
- **Real-Time KPI Metric Cards:** Real-time counters for Waiting, Currently Serving, Completed, and Cancelled.
- **Interactive Register Table:** Filterable by status (`All`, `Waiting`, `Serving`, `Completed`, `Cancelled`) with inline action buttons.
- **Safe Queue Reset:** Department-level and global queue reset protected by modal confirmation dialogs.

### C. Multi-Department Isolation
- **Independent Queues:** Each department maintains its own independent sequence number, currently serving token, and token registry.
- Supported Counters:
  1. **Administration Office** (`Prefix: A`, `Counter 1 — Window A`)
  2. **Fee Payment Counter** (`Prefix: F`, `Counter 2 — Window B`)
  3. **Laboratory Support** (`Prefix: L`, `Counter 3 — Lab Desk`)

### D. Public Waiting Room Display Board
- Fullscreen monitor mode for waiting room television screens.
- Massive, pulsating "NOW SERVING" display with glowing alert effects.
- "Next in Line" upcoming roster.
- Campus-wide counter status grid displaying all 3 departments side-by-side.

### E. Zero-Dependency Resilience
- 100% functional offline without internet access.
- No third-party CDN scripts, fonts, or external image dependencies.
- Zero server-side runtime requirement (pure static HTML/CSS/JS).

---

## 3. Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SMART QUEUE ARCHITECTURE                      │
└─────────────────────────────────────────────────────────────────────────┘

 ┌───────────────────┐    ┌───────────────────┐    ┌────────────────────┐
 │   Visitor Kiosk   │    │  Admin Desk View  │    │  Public Display TV │
 └─────────┬─────────┘    └─────────┬─────────┘    └──────────┬─────────┘
           │                        │                         │
           ▼                        ▼                         ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │                      UI Controller & Event Layer                     │
 └──────────────────────────────────┬───────────────────────────────────┘
                                    │
                                    ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │                  QueueEngine (Pure Business Logic)                   │
 │  • Sequential Prefixing (A001)   • Concurrency Guard (1 Serving)     │
 │  • Status Transitions (FIFO)     • Department Isolation (A, F, L)    │
 └──────────────────────────────────┬───────────────────────────────────┘
                                    │
                                    ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │                    StorageManager & Schema Validator                 │
 └──────────────────────────────────┬───────────────────────────────────┘
                                    │
                                    ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │               Browser LocalStorage (`smart_queue_data_v1`)           │
 │               (Persists across refreshes, reboots & tabs)            │
 └──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Technology Stack

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Markup** | HTML5 Semantic Elements | Accessible ARIA landmarks, modal dialogs, and clean document hierarchy |
| **Styling** | Vanilla CSS3 Design System | Layered elevation shadows, responsive grid, print styles, and micro-interactions |
| **Logic** | Vanilla JavaScript (ES6+) | Pure modular engine, zero third-party framework overhead, instant execution |
| **Storage** | Browser `LocalStorage` | Client-side persistence without database configuration or network lag |
| **Testing** | Node.js Built-in Test Runner (`node:test`) | Fast, native automated unit tests without hefty npm node_modules |
| **Container** | Docker & Nginx Alpine | Ultra-lightweight production static web server image (~25MB) |
| **CI/CD** | GitHub Actions | Automated test verification and Docker build pipeline on every commit |

---

## 5. Project File Structure

```
smart-queue/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI workflow (Tests + Docker)
├── tests/
│   └── app.test.js            # Automated unit test suite (8 test scenarios)
├── .dockerignore              # Excludes repo overhead from Docker build
├── .gitignore                 # Excludes local artifacts from Git tracking
├── Dockerfile                 # Multi-stage production Nginx Alpine image
├── index.html                 # Main single-page application markup
├── nginx.conf                 # Hardened Nginx configuration (gzip, security headers)
├── package.json               # Node test scripts and local preview server
├── README.md                  # Comprehensive technical documentation
└── styles.css                 # Custom CSS design system (white & orange aesthetic)
```

---

## 6. Local Execution Instructions

Because Smart Queue is built entirely with client-side web standards, you can run it in multiple ways:

### Option A: Direct Browser Launch (Simplest)
Simply double-click `index.html` or open it with your favorite browser:
```bash
# On Windows (PowerShell)
Start-Process index.html

# On macOS
open index.html

# On Linux
xdg-open index.html
```

### Option B: Using Node.js Built-in Preview Server
Run the lightweight preview server defined in `package.json`:
```bash
npm start
```
Then navigate to: `http://localhost:3000`

### Option C: Using Python
```bash
# Python 3
python -m http.server 8080
```
Then navigate to: `http://localhost:8080`

---

## 7. LocalStorage Persistence & Educational Disclaimers

### How Persistence Works
- Application state is serialized as a JSON document under the key `smart_queue_data_v1`.
- State includes active sequence counters, token objects, timestamps, cancellation reasons, and user-selected departments.
- When the page is reloaded, `StorageManager.load()` parses the JSON, validates its schema against `QueueEngine.validateState()`, and restores full queue state.

### Important Educational Disclaimers
> [!IMPORTANT]
> **Single-Device / Single-Browser Scope:**
> `LocalStorage` is sandbox-isolated to a single browser profile on a single computer. Tokens generated on Machine A will **not** automatically sync to Machine B.

> [!NOTE]
> **Demonstration Architecture:**
> This project is designed as an educational DevOps demonstration. It does **not** replace an enterprise multi-tenant database (e.g., PostgreSQL/Redis) and does not provide cryptographic user authentication. No sensitive personal information or passwords are ever stored.

---

## 8. Automated Testing

The project includes an automated test suite covering 8 core business logic scenarios:
1. Sequential token generation and 3-digit prefix formatting (`A001`, `A002`, `A003`).
2. Calling the next token and enforcing the single active serving token constraint.
3. Completing the active serving token and transitioning state to completed.
4. Cancelling waiting tokens and verifying queue progression.
5. Independent department isolation across Administration, Fee, and Lab counters.
6. Department queue reset and total global reset routines.
7. LocalStorage state serialization and full deserialization restore.
8. Error resilience against corrupted JSON or invalid storage structures.

### Running the Tests
Run the test runner using Node.js:
```bash
npm test
```
Or run directly:
```bash
node --test tests/app.test.js
```

---

## 9. Docker Containerization

The project includes an optimized `Dockerfile` based on `nginx:alpine` to package the website as an immutable container.

### Step 1: Build the Docker Image
```bash
docker build -t smart-queue:latest .
```

### Step 2: Run the Docker Container
```bash
docker run -d -p 8080:80 --name smart-queue-app smart-queue:latest
```

### Step 3: Access the Application
Open your browser and navigate to:
```
http://localhost:8080
```

### Step 4: Stop and Remove Container
```bash
docker stop smart-queue-app
docker rm smart-queue-app
```

---

## 10. Continuous Integration (GitHub Actions)

A GitHub Actions workflow is preconfigured in `.github/workflows/ci.yml`.

### Pipeline Stages:
1. **Test & Validation Job:**
   - Installs Node.js 20.
   - Performs syntax checking using `node --check`.
   - Executes the automated test suite (`npm test`). Fails the build if any test fails.
2. **Docker Container Build Job:**
   - Runs automatically upon successful test completion.
   - Builds the Docker image via Buildx.
   - Spins up the container and verifies HTTP response (`curl -f http://localhost:8080/`).

---

## 11. Git & GitHub Publishing Instructions

To initialize version control and push the project to your GitHub repository:

```bash
# 1. Check current git status
git status

# 2. Stage all project files
git add .

# 3. Commit the implementation
git commit -m "feat: complete smart queue token management system with tests, docker, and ci"

# 4. Push to your GitHub main branch
git push -u origin main
```

---

## 12. Deployment Options

Since Smart Queue is a static web application, it can be hosted on any static cloud hosting platform:

### 1. GitHub Pages (Free)
1. In your GitHub repository, navigate to **Settings** ➔ **Pages**.
2. Under **Build and deployment** ➔ **Source**, select **Deploy from a branch**.
3. Choose branch `main` and folder `/ (root)`.
4. Click **Save**. Your site will be live at `https://<username>.github.io/<repo-name>/`.

### 2. Vercel
```bash
npx vercel
```

### 3. Netlify
Drag and drop the project folder into [app.netlify.com/drop](https://app.netlify.com/drop).

### 4. Docker / Cloud VPS (AWS EC2, DigitalOcean, Render)
Deploy using the provided `Dockerfile` with Nginx handling production static delivery and SSL termination.

---

## 13. Known Limitations & Future Improvements

### Known Limitations
- State is isolated to the local browser storage (no multi-device WebSocket synchronization).
- No role-based access control (anyone viewing the Admin tab can advance or reset the queue).

### Future Roadmap
- [ ] Implement WebSockets or Server-Sent Events (SSE) for multi-device sync across physical kiosk and counter tablets.
- [ ] Add SMS / WhatsApp notification integration via Twilio when a visitor's token is called.
- [ ] Add daily CSV export for queue analytics and average wait-time auditing.
- [ ] Add barcode / QR code scanning for touchless ticket check-in.

---

## 14. License

Distributed under the **MIT License**. Free for educational, commercial, and personal use.