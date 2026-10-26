# Mobile App Content: what the editors must do (agreed, to be kept by every tab)

Written 2026-10-26. These are requirements of the owner for the editors of the Mobile App Content page, kept in one place so that the tabs
that come after the Welcome (Why Visit, Travel Guide & Tips, Port & Boat Guide) are held to the same rules. Each one has a test in the commit
that builds it.

1. **Counting.** The number of letters is counted the way the SERVER counts it: code points, after cleaning (`Array.from(text).length`, never
   `.length`, and never a `maxlength` on a box). An emoji is one letter; a title of 160 emoji is allowed; 161 is not. Every test that uses a fixture
   asserts, INSIDE the test, that the fixture reached the case (`.length` is not `Array.from().length` for it).
2. **The preview says who "Explorer" is.** In the preview of the Welcome banner `{name}` is shown as "Explorer", and the preview must say, in
   words, that **Explorer is only what a visitor who is NOT logged in is called; a visitor who is logged in sees their own name there.** The editor
   must not let the LGU believe that every visitor is called Explorer. (The editor already says it under the title field.)
3. **The preview is never broken or empty without a reason.** When the place where the fee is paid is empty or missing, the preview shows the app's
   built-in text for that field, muted, with: "What the app will show instead (its built-in text)" and "The place where the fee is paid is not
   filled in yet (Port & Boat Guide tab), so the app cannot show this text. Until it is, the app keeps using its built-in text. You can still save
   this text." When the entrance fee cannot be loaded: `[fee not available]` where the amount goes, and "The current entrance fee could not be loaded,
   so [fee not available] stands where the amount will be. The app will show the real amount. You can still save." An empty required field:
   "Nothing to show yet: this field is required." A list that cannot be loaded: the server's message, "Try again", and "Showing the app's built-in
   text only."
4. **Two people editing.** Before a save the page looks again at the server and, if someone else changed a field that this person changed, it does
   NOT save: it shows what the other person wrote and what is typed, and offers "Keep editing" and "Save my text anyway". The page says in words that
   this check is not a guarantee (two saves at the same moment: the last wins). It never promises more.
5. **The server's words, under the field.** A refusal of a field is shown exactly as the server wrote it, under that field, and what was typed is
   kept. A change that needs a confirmation (409 `confirm_required`) is shown with the server's question and a Confirm that sends the same change again
   with the names the server asked about.
6. **After a save, the answer of the server is what is shown**, not what was typed (the server cleans the text).
7. **No save on live during a live-after** (see MOBILE_CONTENT_NO_SAVE_ON_LIVE_DURING_MEASUREMENT.md).
