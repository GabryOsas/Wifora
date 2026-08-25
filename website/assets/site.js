;(function () {
  'use strict'

  var THEME_KEY = 'wifora_theme'

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme)
    var sun = document.getElementById('sunIcon')
    var moon = document.getElementById('moonIcon')
    if (sun && moon) {
      sun.hidden = theme !== 'light'
      moon.hidden = theme === 'light'
    }
  }

  var saved = null
  try {
    saved = localStorage.getItem(THEME_KEY)
  } catch {
    // localStorage non disponibile: resta il tema di default
  }

  applyTheme(saved === 'light' ? 'light' : 'dark')

  var themeBtn = document.getElementById('themeToggleBtn')
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
      applyTheme(next)
      try {
        localStorage.setItem(THEME_KEY, next)
      } catch {
        // persistenza non disponibile: il tema resta solo per la sessione
      }
    })
  }

  // Sidebar wiki mobile
  var sidebar = document.getElementById('wikiSidebar')
  var backdrop = document.getElementById('sidebarBackdrop')
  var openBtn = document.getElementById('sidebarOpenBtn')
  var closeBtn = document.getElementById('sidebarCloseBtn')

  function setSidebar(open) {
    if (!sidebar || !backdrop) return
    sidebar.classList.toggle('open', open)
    backdrop.classList.toggle('show', open)
  }

  if (openBtn)
    openBtn.addEventListener('click', function () {
      setSidebar(true)
    })
  if (closeBtn)
    closeBtn.addEventListener('click', function () {
      setSidebar(false)
    })
  if (backdrop)
    backdrop.addEventListener('click', function () {
      setSidebar(false)
    })

  // Link attivo nella sidebar in base a <body data-page="...">
  var page = document.body.getAttribute('data-page')
  if (page && sidebar) {
    var links = sidebar.querySelectorAll('a[href]')
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || ''
      var file = href.split('/').pop().split('?')[0]
      if (file === page + '.html') links[i].classList.add('active')
    }
  }

  // Copia blocchi codice
  document.querySelectorAll('pre.code[data-copy]').forEach(function (pre) {
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn btn-secondary btn-sm copy-btn'
    btn.textContent = 'Copia'
    btn.addEventListener('click', function () {
      var text = pre.querySelector('code')
        ? pre.querySelector('code').textContent
        : pre.textContent.replace(/^Copia\s*/, '')
      navigator.clipboard.writeText(text.trim()).then(
        function () {
          btn.textContent = 'Copiato'
          setTimeout(function () {
            btn.textContent = 'Copia'
          }, 1600)
        },
        function () {}
      )
    })
    pre.style.position = 'relative'
    pre.appendChild(btn)
  })

  // Anno corrente nel footer
  var yearEl = document.getElementById('yearNow')
  if (yearEl) yearEl.textContent = String(new Date().getFullYear())
})()
