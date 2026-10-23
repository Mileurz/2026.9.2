# Firebase for beginners (web)

This is a small walkthrough for someone new to **Firebase** and the command line. You will:

1. Learn what Firebase is, in plain language
2. Create a free Firebase project in the browser
3. Register a **Web** app and copy its config
4. Install the Firebase library in a React app
5. Connect the app and save one piece of data
6. Read that data back and show it on the page

You need a Google account (Gmail is fine). You also need **Node.js** and a React app. If you do not have those yet, do the **Installing and running React** tutorial first.

---

## 1. What Firebase is

Firebase is a set of **cloud tools** for web and phone apps. Instead of building your own server, you use Google’s servers for things like:

- **Authentication** — sign in with email or Google
- **Firestore** — a database of documents (like saved JSON objects)
- **Hosting** — putting a finished website on the internet
- **Storage** — images and files

This tutorial uses **Firestore**: a place to **write** data and **read** it later.

Think of it like this:

- Your React app runs on the student’s computer (or later, on a website)
- Firebase runs in the cloud
- The app sends data to Firebase, and Firebase sends data back

You will not need to write a PHP or Node server for this lesson.

---

## 2. Create a Firebase project

1. Open this page: [https://console.firebase.google.com](https://console.firebase.google.com)
2. Sign in with your Google account.
3. Click **Create a project** (or **Add project**).
4. **Project name:** type something like `design-tech-firebase`.
5. Click **Continue**.
6. Google Analytics is optional. For this class you can turn it **off**, then click **Create project**.
7. Wait until it finishes, then click **Continue**.

You should land on the project **overview** (a dashboard with cards for products).

---

## 3. Register a Web app

Firebase needs to know this is a **website**, not an Android or iPhone app.

1. On the overview, click the **Web** icon (`</>`).
2. **App nickname:** type `noise-web` (or any short name).
3. You do **not** need Firebase Hosting yet. Leave that box unchecked.
4. Click **Register app**.
5. You will see a block of config that looks like this (your numbers will be different):

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcd",
}
```

6. **Copy this whole object** into a notes file. You will paste it into code in section 6.
7. Click **Continue to console**.

Treat `apiKey` like a public app ID, not a password. Still: **do not put it in a public GitHub repo** for a class project unless a teacher says it is okay. For a local class demo on your own computer, it is fine.

---

## 4. Turn on Firestore

1. In the left menu, click **Build**, then **Firestore Database**.
2. Click **Create database**.
3. Start in **test mode** for this lesson (it lets your app read and write for a limited time).
4. Pick a location close to you (for example a US region if you are in the US).
5. Click **Create**.

Wait until the empty database appears. That empty table is where your documents will live.

**Test mode** is for learning. Do not use it for a real public product. Later you write **security rules** so only the right people can read or write.

---

## 5. Open your React app in the terminal

In Cursor, open the terminal:

- Menu: **Terminal → New Terminal**
- Or press **Ctrl + `** (the key under Escape, next to 1)

Go to your React app folder. If you followed the earlier tutorial, that is:

```powershell
cd "F:\DT\2026.9.2\my-react-app"
```

If your app lives in `F:\DT\2026.9.22\` instead, `cd` into that folder.

Check you are in the right place: you should see `package.json` in that folder.

Install the Firebase library:

```powershell
npm install firebase
```

Wait until you see `PS ...>` again.

---

## 6. Add the config file

In the `src` folder, create a file named `firebase.ts`.

Paste this, then **replace** the `firebaseConfig` values with **your** config from section 3:

```ts
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
```

What this means, in plain language:

- `initializeApp` = “connect this website to my Firebase project”
- `getFirestore` = “give me the database”
- `db` = the object the rest of your code will use to read and write

---

## 7. Save one document, then read it

Firestore stores **documents** inside **collections**. A collection is a named list. A document is one record.

For this lesson:

- Collection name: `notes`
- Document id: `hello`
- Field: `text`

Create `src/FirebaseNote.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'

export function FirebaseNote() {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [status, setStatus] = useState('Not saved yet')

  useEffect(() => {
    const load = async () => {
      const snap = await getDoc(doc(db, 'notes', 'hello'))
      if (snap.exists()) {
        const value = String(snap.data().text ?? '')
        setSaved(value)
        setText(value)
        setStatus('Loaded from Firebase')
      }
    }
    load().catch(() => setStatus('Could not load (check rules and config)'))
  }, [])

  const save = async () => {
    setStatus('Saving…')
    try {
      await setDoc(doc(db, 'notes', 'hello'), { text })
      setSaved(text)
      setStatus('Saved')
    } catch {
      setStatus('Could not save (check rules and config)')
    }
  }

  return (
    <section>
      <h2>Firebase note</h2>
      <p>{status}</p>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Type a note"
      />
      <button type="button" onClick={save}>
        Save to Firebase
      </button>
      {saved ? <p>Last saved: {saved}</p> : null}
    </section>
  )
}
```

Then import it in `src/App.tsx` and put `<FirebaseNote />` somewhere on the page.

Start the app if it is not running:

```powershell
npm run dev
```

Open the **Local** URL (often `http://localhost:5173/`).

Type a note, click **Save to Firebase**. Refresh the page. The note should come back. That means read and write both worked.

In the Firebase console, open **Firestore Database**. You should see collection `notes` and document `hello`.

---

## 8. What the code is doing

```text
setDoc(doc(db, 'notes', 'hello'), { text })
```

- `db` = your database
- `'notes'` = collection name
- `'hello'` = document id
- `{ text }` = the data inside

```text
getDoc(doc(db, 'notes', 'hello'))
```

That reads the same document back.

This is the basic loop for almost every Firebase app: **write a document**, **read a document**.

---

## Quick cheat sheet

| Goal | Where / command |
| --- | --- |
| Open Firebase | [https://console.firebase.google.com](https://console.firebase.google.com) |
| Create a project | **Add project** |
| Add a website | Overview → **Web** `</>` |
| Turn on the database | **Build → Firestore Database** |
| Go to the React app | `cd "F:\DT\2026.9.2\my-react-app"` |
| Install Firebase | `npm install firebase` |
| Start the app | `npm run dev` |
| Save data | `setDoc(...)` |
| Load data | `getDoc(...)` |

---

## If something goes wrong

**The console asks you to enable billing**  
A Spark (free) plan is enough for this lesson. If a product is blocked, stay on Firestore + a Web app only.

**`Firebase: Error (auth/invalid-api-key)` or the app will not connect**  
The config in `firebase.ts` does not match the console. Copy it again from **Project settings → Your apps**.

**Permission denied / missing or insufficient permissions**  
Firestore rules are blocking you. For class only, **Build → Firestore → Rules** can look like this while you learn (then change it later):

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

That allows **anyone** who has your config to read and write. Fine for a local demo. **Not** fine for a public site.

**`npm` is not recognized, or scripts are disabled**  
Node is missing, or PowerShell is blocking scripts. Use the React install tutorial, including:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Nothing appears in Firestore after Save**  
Confirm `npm run dev` is running, you clicked Save, and there is no red error in the browser **Console** (right-click the page → **Inspect** → **Console**).

**You are in the wrong folder**  
`firebase` must be installed in the same folder as `package.json`. Run `cd` to that folder, then `npm install firebase` again.

---

## What to try next (optional)

- **Authentication:** **Build → Authentication → Sign-in method → Email/Password**, then `signInWithEmailAndPassword`
- **More documents:** use `addDoc(collection(db, 'notes'), { text })` so each save gets a new id
- **Live updates:** `onSnapshot(doc(db, 'notes', 'hello'), ...)` so the page updates when the database changes
- **Hosting:** **Build → Hosting** to put the finished site on a `web.app` URL

For this course, stop when save + load works. That is the core idea.
