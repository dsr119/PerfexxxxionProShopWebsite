// Header menu, shared by every page.
//
// The phone-width Menu button opens and closes the nav. Escape closes it again
// and puts focus back on the button, and Escape also hides the desktop
// "Schedule an Appointment" dropdown, which otherwise stays open while the
// mouse or keyboard focus is on it.
(function () {
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');

  function setOpen(open) {
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', open);
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('nav-open'));
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;

    if (toggle && document.body.classList.contains('nav-open')) {
      setOpen(false);
      toggle.focus();
      return;
    }

    var openSub = nav && nav.querySelector('.has-sub:hover, .has-sub:focus-within');
    if (openSub && !openSub.classList.contains('sub-dismissed')) {
      openSub.classList.add('sub-dismissed');
      if (openSub.contains(document.activeElement)) openSub.querySelector('a').focus();
    }
  });

  // The dropdown comes back the next time it is hovered or tabbed into.
  if (nav) {
    nav.querySelectorAll('.has-sub').forEach(function (item) {
      item.addEventListener('mouseleave', function () { item.classList.remove('sub-dismissed'); });
      item.addEventListener('focusout', function (event) {
        if (!item.contains(event.relatedTarget)) item.classList.remove('sub-dismissed');
      });
    });
  }
})();
