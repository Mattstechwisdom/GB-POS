# GadgetBoy POS v0.6.74

- Restores the current technician QR workflow for all existing printed repair and sales QR codes by deploying the public app from the protected main branch.
- Prevents sales sheets from printing silently without a QR code; a clear connection/save error is shown until a verified QR is ready.
- Stores technician promises with their exact date, time, and note.
- Prioritizes expedited repairs first, then promised work by its deadline.
- Keeps scheduled pickup as the timing anchor for pickup reminders and storage-fee review.
