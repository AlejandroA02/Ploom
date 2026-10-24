# Ploom

A personal screen + camera recorder for Windows and macOS. Records your screen (or one window) with a camera bubble, your mic, and computer sound, and saves an `.mp4` to your Videos folder.

## Setup

You need [Node.js](https://nodejs.org) (LTS) and [Git](https://git-scm.com).

```sh
git clone https://github.com/AlejandroA02/Ploom.git
cd Ploom
npm install
npm start
```

`npm install` also puts a **Ploom** shortcut on your Desktop, so after the first time just double-click it (or run `npm start` from the `Ploom` folder). The shortcut points at this folder, so if you move the folder, run `npm install` again.

## Using it

- Pick a screen or window and a mic from the bar, then hit record (or press `Ctrl+Shift+L` / `Cmd+Shift+L` to start and stop).
- Toggle the camera bubble and computer sound with the bar icons. Drag the bubble anywhere; S/M/L resizes it.
- The bar and countdown never show up in the recording.
- Recordings are saved to `Videos/Ploom` (Windows) or `Movies/Ploom` (macOS).

## macOS permissions

macOS lists Ploom under a different name depending on how you open it: **Electron** if you use the Desktop shortcut, or your **terminal app** (Terminal, iTerm, VS Code…) if you use `npm start`. On first run:

1. Allow **Camera** and **Microphone** when prompted.
2. In **System Settings → Privacy & Security → Screen & System Audio Recording**, turn on Electron (or your terminal app), then quit and reopen Ploom.

Computer sound needs macOS 14.2 or newer and the **System Audio Recording** permission. If it's not available, Ploom tells you and records without it.

## License

[ISC](LICENSE)
