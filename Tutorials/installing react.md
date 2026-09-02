# Installing and running React (TypeScript)

This is a very small walkthrough for someone new to React **and** the command line. You will:

1. Install Node.js (the program that lets you run JavaScript tools)
2. Open a terminal in this project
3. Create a **React + TypeScript** app
4. Answer the installer questions (this page tells you what to pick)
5. Start it and open it in a browser

You only need to do the Node.js install once on your computer. After that, you can skip to **Create a React app**.

---

## 1. Install Node.js

1. Open this page: [https://nodejs.org](https://nodejs.org)
2. Download the **LTS** (Long Term Support) version for Windows.
3. Run the installer. Click **Next** through the screens and leave the default options.
4. When it finishes, **close and reopen Cursor** so it can see Node.js.

### Check that it worked

In Cursor, open the terminal:

- Menu: **Terminal → New Terminal**
- Or press **Ctrl + `** (the key under Escape, next to 1)

You should see a line that looks a bit like this (your folder name may differ):

```text
PS F:\DT\2026.9.2>
```

That `PS` means you are using **PowerShell**. Type these two commands, one at a time, and press **Enter** after each:

```powershell
node -v
npm -v
```

You should see version numbers, for example `v22.x.x` and `10.x.x`.

If `node -v` works but `npm -v` says scripts are disabled, skip down to **If something goes wrong**. Node is fine; PowerShell is blocking `npm`.

---

## 2. What the terminal is doing

You type a command, press **Enter**, and wait until a new `PS ...>` line appears. That means the computer is ready for the next command.

How to answer installer questions:

- If it is a **yes / no** question, type `y` or `n` and press **Enter**.
- If it is a **list**, use the **up and down arrow keys** to highlight an option, then press **Enter**.
- Do not type the option name unless it asks you to type something (like a project name).

To stop a running app later, click in the terminal and press **Ctrl + C**.

---

## 3. Create a React + TypeScript app

Make sure the terminal is in this folder (`F:\DT\2026.9.2`). If you are not sure, run:

```powershell
cd "F:\DT\2026.9.2"
```

Then create the app. This uses **Vite**, and `--template react-ts` means React with TypeScript:

```powershell
npm create vite@latest my-react-app -- --template react-ts
```

What this means, in plain language:

- `npm` = the package tool that came with Node.js
- `create vite@latest` = “set up a new project using Vite”
- `my-react-app` = the folder name for your React app
- `--template react-ts` = “React, using TypeScript”

---

## 4. Answer the installer questions

You will not always see every question. Answer only the ones that appear. Use these choices.

### A. `Ok to proceed? (y)`

npm is asking permission to download the Vite starter tool.

**Answer:** type `y` and press **Enter**.

---

### B. `Use Vite 8 beta (Experimental)?`

This may appear. Beta software is optional and not needed here.

**Answer:** choose **No** (arrow keys if needed, then **Enter**).

---

### C. `Project name:`

This only appears if you did not already put `my-react-app` in the command.

**Answer:** type `my-react-app` and press **Enter**.

---

### D. `Target directory "my-react-app" is not empty...`

This only appears if that folder already exists.

**Answer:** choose **Cancel operation**. Then either delete the old folder, or pick a new name such as `my-react-app-2` and run the create command again.

---

### E. `Select a framework:`

This only appears if you did **not** use `--template react-ts`.

**Answer:** choose **React**.

---

### F. `Select a variant:`

This only appears if you did **not** use `--template react-ts`.

**Answer:** choose **TypeScript**.

Do **not** pick JavaScript.  
Do **not** pick TypeScript + React Compiler for this first setup.  
Do **not** pick React Router, TanStack, or the other extra starters.

---

### G. `Which linter to use?`

A linter is a helper that flags mistakes in your code. Either option is fine for this course.

**Answer:** choose **Oxlint** (the first option).

If a teacher later asks for ESLint, you can choose **ESLint** instead.

---

### H. `Install with npm and start now?`

This can install the files **and** start the app in one step.

**Answer for learning the commands:** choose **No**. Then continue with section 5 below.

**Answer for the fastest path:** choose **Yes**. When it finishes, skip to section 6 and open the URL it prints (usually `http://localhost:5173/`).

---

## 5. Install the app’s files (if you chose No)

Move into the new folder, then install dependencies (the extra files React needs):

```powershell
cd my-react-app
npm install
```

This can take a minute. Wait until you see `PS ...\my-react-app>` again.

---

## 6. Run the app

Still inside `my-react-app`, run:

```powershell
npm run dev
```

You should see something like:

```text
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

Hold **Ctrl** and click the `http://localhost:5173/` link, or paste that address into your browser.

You should see the default Vite + React page. That means it worked.

Leave this terminal running while you work. Opening a **second** terminal is fine if you need to type other commands.

### How you know it is TypeScript

In the `my-react-app` folder, you should see files such as:

- `tsconfig.json`
- `src/main.tsx`
- `src/App.tsx`

`.tsx` means a React file written in TypeScript.

---

## 7. Stop the app

Click in the terminal where `npm run dev` is running, then press:

**Ctrl + C**

If it asks whether to terminate, type `Y` and press **Enter**.

To start it again later:

```powershell
cd "F:\DT\2026.9.2\my-react-app"
npm run dev
```

You do **not** need to run `npm create` or `npm install` again unless you start a brand new app.

---

## Quick cheat sheet

| Goal | Command |
| --- | --- |
| Go to this project | `cd "F:\DT\2026.9.2"` |
| Create React + TypeScript | `npm create vite@latest my-react-app -- --template react-ts` |
| Go into the React app | `cd my-react-app` |
| Install files | `npm install` |
| Start the app | `npm run dev` |
| Stop the app | `Ctrl + C` |
| Check Node is installed | `node -v` |

### Question cheat sheet

| If you see | Choose |
| --- | --- |
| Ok to proceed? | `y` |
| Use Vite 8 beta? | No |
| Project name | `my-react-app` |
| Select a framework | React |
| Select a variant | TypeScript |
| Which linter? | Oxlint |
| Install with npm and start now? | No (then run `npm install` and `npm run dev`) |

---

## If something goes wrong

**`node` is not recognized**  
Install Node.js from [nodejs.org](https://nodejs.org), then fully quit and reopen Cursor.

**`npm -v` says scripts are disabled / `npm.ps1 cannot be loaded`**  
Node is installed. PowerShell is blocking `.ps1` scripts, and `npm` is one of those scripts. Allow scripts for your Windows user, then try again:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Type `Y` and press **Enter**. Then run `npm -v` again.

Quick workaround without changing the policy: type `npm.cmd -v` instead of `npm -v`.

**`npm create` fails or hangs**  
Check you have internet. Try the same command again.

**The browser page is blank or will not load**  
Confirm `npm run dev` is still running, and that you opened the URL shown in the terminal (often `http://localhost:5173/`).

**You are in the wrong folder**  
Run `cd "F:\DT\2026.9.2\my-react-app"` and try `npm run dev` again.

**You picked JavaScript by mistake**  
That is okay. Delete the `my-react-app` folder (or use a new name) and run the create command again with `--template react-ts`.
