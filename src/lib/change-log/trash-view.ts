/**
 * The trash page's rail/URL id (KAN-451) — same pattern as
 * {@link CHANGE_LOG_NODE_ID} in `log-page.ts`: a reserved virtual node, no
 * `pages` row, no migration. The pure view model (`buildTrashRows`) lands
 * here too once it's built.
 */

/** The rail/URL id for the trash page. Never a real page id. */
export const TRASH_NODE_ID = '__trash__'
