/* ================================================================
   config.js — the only file you need to edit for personal content.

   Everything below is PLACEHOLDER content (Lorem Ipsum + free public
   photos). Replace the text and image URLs whenever you like; no other
   file needs to change.

   IMPORTANT (honest note): this website is 100% client-side. Anything
   written in this file is visible to every visitor (View Source), so
   the "date lock" on the Memory Capsule is a VISUAL INTERACTION, not
   real privacy. Do not rely on it to protect anything sensitive.
   ================================================================ */

/* small helpers for the placeholder photos (picsum.photos = free random photos) */
function px(id, size) { return 'https://picsum.photos/id/' + id + '/' + (size || 420) + '/' + (size || 420); }
function item(src, caption) { return { src: src, caption: caption }; }

window.LOVE_CONFIG = {

  /* ---------- Chapter 3 · Memory Capsule ---------- */
  // '' (empty)    -> demo mode: any valid date opens the capsule.
  // 'YYYY-MM-DD'  -> only that date opens it.   18.07.2026  ->  '2026-07-18'
  unlockDate: '2026-07-18',
  capsulePrompt: 'Our first date?',
  capsuleHint: 'Not quite… think of the nervous hello.',

  // temporary couple photo (free Unsplash photo) — swap for your own URL or 'assets/images/us.jpg'
  capsule: {
    photo: 'https://unsplash.com/photos/ZRMHeRV_xE8/download?force=true&w=900',
    alt: 'A couple holding each other at sunset (placeholder photo)',
    caption: 'Lorem ipsum dolor sit amet'
  },

  /* ---------- Chapter 1 · letter on the parchment ---------- */
  openingLetter: {
    title: 'Lorem ipsum,',
    paragraphs: [
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.',
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.',
      'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.'
    ],
    sign: '— Lorem ipsum'
  },

  /* ---------- Chapter 5 · letter inside the envelope ---------- */
  envelopeLetter: {
    title: 'Dolor sit amet,',
    paragraphs: [
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.',
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.'
    ],
    sign: '— Consectetur'
  },

  /* ---------- Chapter 7 · the three photo spheres ---------- */
  // Each category needs an id, a label and a list of { src, caption }.
  // Add or remove items freely (10–24 per category looks best).
  gallery: {
    categories: [
      {
        id: 'moments',
        label: 'Our Moments',
        items: [
          item('https://unsplash.com/photos/ZRMHeRV_xE8/download?force=true&w=500', 'Lorem ipsum dolor'),
          item('https://unsplash.com/photos/8c3zjKrkkBA/download?force=true&w=500', 'Sit amet consectetur'),
          item(px(1011), 'Adipiscing elit'),
          item(px(1012), 'Sed do eiusmod'),
          item(px(1015), 'Tempor incididunt'),
          item(px(1016), 'Ut labore et dolore'),
          item(px(1018), 'Magna aliqua'),
          item(px(1019), 'Ut enim ad minim'),
          item(px(1020), 'Veniam quis nostrud'),
          item(px(1021), 'Exercitation ullamco'),
          item(px(1024), 'Laboris nisi'),
          item(px(1025), 'Ut aliquip ex ea'),
          item(px(1027), 'Commodo consequat'),
          item(px(1028), 'Duis aute irure'),
          item(px(1029), 'Dolor in reprehenderit'),
          item(px(1031), 'In voluptate velit'),
          item(px(1033), 'Esse cillum dolore'),
          item(px(1035), 'Eu fugiat nulla')
        ]
      },
      {
        id: 'her',
        label: 'Her Gallery',
        items: [
          item(px(64), 'Lorem ipsum'),
          item(px(65), 'Dolor sit amet'),
          item(px(91), 'Consectetur'),
          item(px(177), 'Adipiscing elit'),
          item(px(338), 'Sed do eiusmod'),
          item(px(342), 'Tempor incididunt'),
          item(px(349), 'Ut labore'),
          item(px(447), 'Et dolore magna'),
          item(px(453), 'Aliqua ut enim'),
          item(px(433), 'Ad minim veniam'),
          item(px(399), 'Quis nostrud'),
          item(px(331), 'Exercitation'),
          item(px(325), 'Ullamco laboris'),
          item(px(823), 'Nisi ut aliquip'),
          item(px(838), 'Ex ea commodo'),
          item(px(641), 'Consequat duis')
        ]
      },
      {
        id: 'memories',
        label: 'Our Memories',
        items: [
          item(px(110), 'Lorem ipsum'),
          item(px(111), 'Dolor sit amet'),
          item(px(112), 'Consectetur'),
          item(px(113), 'Adipiscing elit'),
          item(px(114), 'Sed do eiusmod'),
          item(px(115), 'Tempor incididunt'),
          item(px(116), 'Ut labore'),
          item(px(117), 'Et dolore'),
          item(px(118), 'Magna aliqua'),
          item(px(119), 'Ut enim'),
          item(px(120), 'Ad minim'),
          item(px(121), 'Veniam quis'),
          item(px(122), 'Nostrud'),
          item(px(123), 'Exercitation'),
          item(px(124), 'Ullamco'),
          item(px(125), 'Laboris nisi'),
          item(px(126), 'Ut aliquip'),
          item(px(127), 'Ex ea commodo')
        ]
      }
    ],
    // shown if any photo URL fails to load
    fallback: function (i) { return 'https://picsum.photos/seed/love' + i + '/420/420'; }
  }
};