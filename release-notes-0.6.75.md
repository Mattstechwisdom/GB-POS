# GadgetBoy POS v0.6.75

- Fixes the Windows auto-updater racing the old-version uninstaller while GadgetBoy POS files are still locked.
- The automatic update now finishes database/cloud shutdown preparation, waits for the running POS process to fully exit, allows Windows a brief lock-release period, and only then starts the silent installer.
- Preserves the one-click **Auto Update and Relaunch** experience without displaying the assisted installer.
