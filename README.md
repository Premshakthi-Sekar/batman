# Desktop Batman

A tiny Batman lives on your desktop. He wanders around the screen on his own. Click him to talk, send him to sleep, or shut him down.

## What he does

- Walks randomly around your screen, always on top
- Click him to open a small panel
- **Ask**: type a question and he answers through **Google Gemini** (free) or OpenAI
- **Sleep**: hide him for 2, 3, or 4 hours. When the timer ends, he comes back on patrol
- **Settings**: paste a Gemini or OpenAI API key (saved only on this computer)
- Tray icon: sleep, wake, ask, or quit even if you cannot see him

## Run it

You need Node.js 18+ and a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). OpenAI still works if you have billing credit.

```bash
npm install
npm start
```

Click Batman → **Settings** → Provider **Google Gemini (free)** → paste the key → **Save**.

Optional: set the key in the environment instead of the Settings tab.

```bash
# macOS / Linux
export GEMINI_API_KEY=your-gemini-key
npm start
```

## Daily use

1. Batman appears as a small figure and starts walking.
2. Click him.
3. Use **Ask** to chat.
4. Use **Sleep** if you do not want him on screen for a while.
5. Right-click the tray icon for the same options.
6. **Quit Batman** (or the tray Quit item) closes the app until you start it again.

Sleep is remembered if you quit and reopen before the nap is over. He stays hidden until the time is up, or until you choose **Wake up now**.

## Tests

```bash
npm test
```

## Troubleshooting (Mac)

Use Homebrew Node, not Anaconda’s old Node 6. After `brew install node`:

```bash
conda deactivate
export PATH="/opt/homebrew/bin:$PATH"
node -v   # should be v18+ (for example v26), not v6
```

If `npm start` says Electron failed to install, the binary was not downloaded yet. Pull the latest branch, then:

```bash
conda deactivate
export PATH="/opt/homebrew/bin:$PATH"
cd ~/batman
git pull
rm -rf node_modules
npm install
node node_modules/electron/install.js
npm start
```

Wait for the Electron download to finish (it can take a minute). You should then see a tiny Batman on the desktop.

macOS may ask you to allow **Electron** (not Cursor) under **System Settings → Privacy & Security**, at the **bottom** of that page.
