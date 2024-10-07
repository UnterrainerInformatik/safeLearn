/**
 * This fixes the auto-scrolling issue when clicking on a link with a hash.
 * The problem is that the browser does not take into account the fixed header when scrolling to the element.
 */
window.addEventListener("hashchange", function () {
  window.scrollBy(0, -50); // 50 is the height of your fixed header.
});

window.addEventListener("scroll", function () {
  markTopAnchor();
});

function markTopAnchor() {
  const mainAnchors = document.querySelectorAll(".docanchor");
  const sidebarAnchors = document.querySelectorAll(".sidebar-anchors a");
  sidebarAnchors.forEach((anchor) => anchor.classList.remove("highlight"));

  let closest = null;
  let closestDistance = Infinity;
  mainAnchors.forEach((anchor) => {
    const rect = anchor.getBoundingClientRect();
    const distance = Math.abs(rect.top - 50);
    if (distance < closestDistance) {
      closest = anchor;
      closestDistance = distance;
    }
  });
  if (closest) {
    const sidebarAnchor = document.querySelector(
      `.sidebar-anchors a[href="#${closest.id}"]`
    );
    if (sidebarAnchor) {
      sidebarAnchor.classList.add("highlight");
    }
  }
}
markTopAnchor();

document.addEventListener("DOMContentLoaded", (event) => {
  const collapsibles = document.querySelectorAll(".obsidian-collapsable");
  collapsibles.forEach((collapsible) => {
    const trigger = collapsible.querySelector(".obsidian-collapsable-trigger");
    trigger.addEventListener("click", () => {
      const content = collapsible.querySelector(".obsidian-callout-content");
      const chevron = collapsible.querySelector(".obsidian-callout-chevron");
      if (content) {
        // If the content is open, close it
        if (content.classList.contains("open")) {
          content.style.maxHeight = "0px";
          content.classList.remove("open");
          chevron.classList.remove("rotated");
        } else {
          // If the content is closed, open it
          // Temporarily make the content visible to calculate the actual height
          content.style.display = "block";
          content.style.visibility = "hidden";
          content.style.maxHeight = "none";
          // Force a reflow to ensure that scrollHeight is calculated correctly
          void content.offsetHeight;
          const height = content.scrollHeight;
          // Set max-height back to 0 and then to the height so it transitions
          content.style.maxHeight = "0px";
          window.getComputedStyle(content).height; // Force repaint
          content.style.maxHeight = height + "px";
          // Make the content invisible again and let the transition make it visible
          content.style.display = "";
          content.style.visibility = "";
          content.classList.add("open");
          chevron.classList.add("rotated");
        }
      }
    });
  });
});

function toggleSidebar() {
  const sidebar = document.querySelector("#sidebar");
  if (sidebar) {
    if (sidebar.classList.contains("width-reveal")) {
      sidebar.style.maxWidth = "0px";
      sidebar.classList.remove("width-reveal");
    } else {
      sidebar.style.display = "block !important";
      sidebar.style.visibility = "hidden";
      sidebar.style.maxWidth = "none";
      // Force a reflow to ensure that scrollWidth is calculated correctly
      void sidebar.offsetWidth;
      const width = sidebar.scrollWidth;
      // Set max-height back to 0 and then to the height so it transitions
      sidebar.style.maxWidth = "0px";
      window.getComputedStyle(sidebar).width; // Force repaint
      sidebar.style.maxWidth = width + "px";
      // Make the content invisible again and let the transition make it visible
      sidebar.style.display = "";
      sidebar.style.visibility = "";
      sidebar.classList.add("width-reveal");
    }
  }

  const burger = document.querySelector(".topbar-burger");
  if (burger) {
    if (burger.classList.contains("force-rotate-left")) {
      burger.classList.remove("force-rotate-left");
    } else {
      burger.classList.add("force-rotate-left");
    }
  }
}

function toggleDirList(name) {
  const list = document.querySelector(`.${name}`);
  if (list) {
    if (list.classList.contains("normal-reveal")) {
      list.style.maxHeight = "0px";
      list.classList.remove("normal-reveal");
    } else {
      list.style.maxHeight = "2000px";
      // Make the content invisible again and let the transition make it visible
      list.style.display = "";
      list.style.visibility = "";
      list.classList.add("normal-reveal");
    }
  }
  const chevron = document.querySelector(`.${name}-chevron`);
  if (chevron) {
    if (chevron.classList.contains("force-rotate-right")) {
      chevron.classList.remove("force-rotate-right");
    } else {
      chevron.classList.add("force-rotate-right");
    }
  }
}

function toggleTopdownMenu() {
  const sidebar = document.querySelector("#topdown-menu");
  if (sidebar) {
    if (sidebar.classList.contains("width-reveal")) {
      sidebar.style.maxWidth = "0px";
      sidebar.classList.remove("width-reveal");
    } else {
      sidebar.style.display = "block !important";
      sidebar.style.visibility = "hidden";
      sidebar.style.maxWidth = "none";
      // Force a reflow to ensure that scrollWidth is calculated correctly
      void sidebar.offsetWidth;
      const width = sidebar.scrollWidth;
      // Set max-height back to 0 and then to the height so it transitions
      sidebar.style.maxWidth = "0px";
      window.getComputedStyle(sidebar).width; // Force repaint
      sidebar.style.maxWidth = width + "px";
      // Make the content invisible again and let the transition make it visible
      sidebar.style.display = "";
      sidebar.style.visibility = "";
      sidebar.classList.add("width-reveal");
    }
  }

  const chevron = document.querySelector(".topdown-menu-chevron");
  if (chevron) {
    if (chevron.classList.contains("force-rotate-right")) {
      chevron.classList.remove("force-rotate-right");
    } else {
      chevron.classList.add("force-rotate-right");
    }
  }
}

function openAsPresentation() {
  const url = new URL(window.location.href);
  url.searchParams.set("reveal", "true");
  window.open(url, "_blank");
}

let mainFontsArray = [];

let navFontsArray = [];

function initFonts(mainFonts, navFonts) {
  mainFontsArray = JSON.parse(mainFonts);
  navFontsArray = JSON.parse(navFonts);
}

async function getUserAttributes() {
  try {
    const r = await fetch("/userattributes", {
      method: "GET",
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
    const result = r.json();
    return result;
  } catch (error) {
    console.error("An error occurred:", error);
    location.reload();
  }
}
async function setUserAttributes(attributesObject) {
  try {
    await fetch("/userattributes", {
      method: "POST",
      body: JSON.stringify(attributesObject),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
  } catch (error) {
    console.error("An error occurred:", error);
    location.reload();
  }
}
async function setParam(key, value) {
  attributes[key] = value;
  await setUserAttributes(attributes);
  applyAttributes();
}

let attributes = {};
function init() {
  getUserAttributes().then((user) => {
    const a = user.accessTokenDecoded.config
      ? JSON.parse(user.accessTokenDecoded.config)
      : {};
    attributes = {
      fs: a.fs || 18,
      t: a.t || 0,
      nt: a.nt || 0,
      s: a.s || 1.6,
      dm: a.dm || 0,
      sl: a.sl || 1,
      vt: a.vt || 0,
      va: a.va || 0,
      ve: a.ve || 0,
    };
    applyAttributes();
    document.body.style.display = "block";
  });
}

const darkModeAffectedElements = [
  "body",
  "#markdown-content",
  "#sidebar",
  "#topbar",
  "#topdown-menu",
  ".sidebar-dirlist a",
  ".sidebar-anchors a",
];

function applyAttributes() {
  for (const qs of darkModeAffectedElements) {
    const darkModeElements = document.querySelectorAll(qs);
    darkModeElements.forEach((element) => {
      if (attributes.dm === 1) {
        element.classList.add("dark-mode");
      } else {
        element.classList.remove("dark-mode");
      }
    });
  }
  const mainContent = document.getElementById("markdown-content");
  if (mainContent) {
    mainContent.style.fontSize = attributes.fs + "px";
    let index = attributes.t;
    if (mainFontsArray.length <= index) index = 0;
    let font = mainFontsArray[index];
    mainContent.style.fontFamily = "main " + font;
    mainContent.style.lineHeight = attributes.s;
  }

  const slcb = document.getElementById("startWithLastPageCheckbox");
  if (slcb) {
    slcb.checked = attributes.sl === 1;
  }

  let tscb = document.getElementById("studentTeacherFs");
  if (tscb) {
    tscb.checked = attributes.vt === 0;
  }
  tscb = document.getElementById("answersFs");
  if (tscb) {
    tscb.checked = attributes.va === 0;
  }
  tscb = document.getElementById("examFs");
  if (tscb) {
    tscb.checked = attributes.ve === 0;
  }

  const navFont = document.querySelectorAll(".nav-font");
  navFont.forEach((item) => {
    let index = attributes.nt;
    if (navFontsArray.length <= index) index = 0;
    let font = navFontsArray[index];
    item.style.fontFamily = "nav " + font;
  });

  const selectControl = document.getElementById("mainFontSelect");
  if (selectControl) {
    selectControl.value = attributes.t;
  }
  const navSelectControl = document.getElementById("navFontSelect");
  if (navSelectControl) {
    navSelectControl.value = attributes.nt;
  }
}
function fontBigger() {
  let v = attributes.fs + 1;
  if (v > 50) v = 50;
  setParam("fs", v);
}
function fontStandard() {
  setParam("fs", 18);
}
function fontSmaller() {
  let v = attributes.fs - 1;
  if (v < 1) v = 1;
  setParam("fs", v);
}
function spacingBigger() {
  let v = attributes.s + 0.1;
  if (v > 5) v = 5;
  setParam("s", v);
}
function spacingStandard() {
  setParam("s", 1.6);
}
function spacingSmaller() {
  let v = attributes.s - 0.1;
  if (v < 1) v = 1;
  setParam("s", v);
}

function mainFontChange(index) {
  setParam("t", index);
}
function navFontChange(index) {
  setParam("nt", index);
}

function toggleLightDark() {
  let v = attributes.dm === 0 ? 1 : 0;
  setParam("dm", v).then(() => {
    setTimeout(() => {
      location.reload();
    }, 1000);
  });
}

function toggleStartWithLastPage() {
  let v = attributes.sl === 0 ? 1 : 0;
  setParam("sl", v);
}

function toggleViewTeacher() {
  let v = attributes.vt === 0 ? 1 : 0;
  setParam("vt", v).then(() => {
    setTimeout(() => {
      location.reload();
    }, 1000);
  });
}
function toggleViewAnswer() {
  let v = attributes.va === 0 ? 1 : 0;
  setParam("va", v).then(() => {
    setTimeout(() => {
      location.reload();
    }, 1000);
  });
}
function toggleViewExam() {
  let v = attributes.ve === 0 ? 1 : 0;
  setParam("ve", v).then(() => {
    setTimeout(() => {
      location.reload();
    }, 1000);
  });
}

/*
* This script is used to resize the right panel by dragging the border.
*/
const BORDER_SIZE = 4;
const panel = document.getElementById("sidebar");

let m_pos;
function resize(e){
  const dx = m_pos - e.x;
  m_pos = e.x;
  panel.style.width = (parseInt(getComputedStyle(panel, '').width) - dx) + "px";
}

panel.addEventListener("mousedown", function(e){
  const cs = getComputedStyle(panel, '')
  const w = parseInt(cs.width) + parseInt(cs.paddingLeft) + parseInt(cs.paddingRight)
  if (e.offsetX >= w - BORDER_SIZE) {
    m_pos = e.x;
    document.addEventListener("mousemove", resize, false);
  }
}, false);

document.addEventListener("mouseup", function(){
  document.removeEventListener("mousemove", resize, false);
}, false);
