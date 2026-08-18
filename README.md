# Desktop Batman

A tiny Batman lives on your desktop. He wanders around the screen on his own. Click him to talk, send him to sleep, or shut him down.

## What he does

- Walks randomly around your screen, always on top
- Click him to open a small panel
- **Ask**: chat with memory. At night, dump tomorrow's to-do list.
- **Today**: see today's and tomorrow's tasks, tick them off.
- Four Mac notifications the next day (default 9:00, 12:00, 16:00, 21:00).
- **Sleep**: hide him for 2, 3, or 4 hours. When the timer ends, he comes back on patrol
- **Sleep**: hide him for 2, 3, or 4 hours. When the timer ends, he comes back on patrol
- **Settings**: paste a Gemini or OpenAI API key (saved only on this computer)
- Tray icon: sleep, wake, ask, or quit even if you cannot see him

## Run it

You need Node.js 18+ and an OpenAI API key from [platform.openai.com](https://platform.openai.com/api-keys) (needs billing credit). Gemini still works if you prefer a free key.

```bash
npm install
npm start
```

Click Batman → **Settings** → Provider **OpenAI** → paste your `sk-...` key → **Save**. The default model is `gpt-4o-mini`. If you paste an `sk-` key while Gemini is selected, Batman still uses OpenAI.

Drag him around the screen. Hover the cursor over him for a backflip or fight stance. A normal click still opens chat.

Optional: set the key in the environment instead of the Settings tab.

```bash
# macOS / Linux
export OPENAI_API_KEY=sk-your-key
npm start
```

## Start him from the Mac menu bar

This puts a bat 🦇 in the top-right menu bar (next to Wi‑Fi). It stays there after you quit Batman and after you restart the Mac.

1. Quit Batman if he is running.
2. In Finder, open the `batman` folder.
3. Double-click **Install menu bar icon.command**.
4. If macOS blocks it: right-click → **Open**.
5. Look at the **top-right** of the screen for 🦇.

**Click the bat** to start him walking. **Right-click** for Quit Batman (stops the character, keeps the bat) or Remove this menu icon.

## Start him again (Mac)

You do **not** need to type the long Terminal commands every time.

1. Open Finder → **batman** folder (usually `Macintosh HD → Users → yourname → batman`).
2. Double-click **Start Batman.command**.
3. Leave that window open while he is running.

The first time, macOS may say it cannot open the file. Right-click it → **Open** → **Open**.

Optional: drag **Start Batman.command** to your Dock so you can launch him with one click.

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
