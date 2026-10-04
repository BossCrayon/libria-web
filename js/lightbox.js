const screenshots = Array.from(
    document.querySelectorAll(".phone img")
);

if (screenshots.length) {
    const buttons = [];

    screenshots.forEach((img, index) => {
        const figure = img.closest("figure");
        const caption =
            figure?.querySelector("figcaption")?.textContent?.trim() || "";

        const button = document.createElement("button");

        button.type = "button";
        button.className = "phone-btn";
        button.setAttribute("aria-label", `Open ${caption || "screenshot"}`);

        img.parentNode.insertBefore(button, img);
        button.appendChild(img);

        buttons.push({
            button,
            img,
            caption,
            index
        });
    });

    const lightbox = document.createElement("div");

    lightbox.className = "lightbox";
    lightbox.hidden = true;

    lightbox.innerHTML = `
    <div class="lightbox-backdrop"></div>

    <button
      type="button"
      class="lightbox-close"
      aria-label="Close screenshot"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18"></path>
      </svg>
    </button>

    <button
      type="button"
      class="lightbox-prev"
      aria-label="Previous screenshot"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 18l-6-6 6-6"></path>
      </svg>
    </button>

    <figure class="lightbox-content">
      <img class="lightbox-image" alt="">
      <figcaption class="lightbox-caption"></figcaption>
    </figure>

    <button
      type="button"
      class="lightbox-next"
      aria-label="Next screenshot"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 18l6-6-6-6"></path>
      </svg>
    </button>
  `;

    document.body.appendChild(lightbox);

    const backdrop = lightbox.querySelector(".lightbox-backdrop");
    const content = lightbox.querySelector(".lightbox-content");
    const image = lightbox.querySelector(".lightbox-image");
    const caption = lightbox.querySelector(".lightbox-caption");
    const close = lightbox.querySelector(".lightbox-close");
    const prev = lightbox.querySelector(".lightbox-prev");
    const next = lightbox.querySelector(".lightbox-next");

    let currentIndex = 0;
    let previousButton = null;

    const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    );

    function showImage(index) {
        currentIndex =
            (index + buttons.length) % buttons.length;

        const item = buttons[currentIndex];

        image.src = item.img.currentSrc || item.img.src;
        image.alt = item.img.alt || item.caption;
        caption.textContent = item.caption;

        prev.hidden = buttons.length <= 1;
        next.hidden = buttons.length <= 1;
    }

    function openLightbox(index) {
        previousButton = buttons[index].button;

        showImage(index);

        lightbox.hidden = false;
        document.documentElement.classList.add("lightbox-open");

        previousButton.classList.add("is-active");

        if (reducedMotion.matches) {
            return;
        }

        requestAnimationFrame(() => {
            lightbox.animate(
                [
                    { opacity: 0 },
                    { opacity: 1 }
                ],
                {
                    duration: 220,
                    easing: "ease-out",
                    fill: "forwards"
                }
            );

            image.animate(
                [
                    {
                        opacity: 0,
                        transform: "scale(.92)"
                    },
                    {
                        opacity: 1,
                        transform: "scale(1)"
                    }
                ],
                {
                    duration: 320,
                    easing: "cubic-bezier(.2,.8,.2,1)",
                    fill: "forwards"
                }
            );
        });

        close.focus();
    }

    function closeLightbox() {
        if (lightbox.hidden) {
            return;
        }

        if (reducedMotion.matches) {
            finishClose();
            return;
        }

        const animation = lightbox.animate(
            [
                { opacity: 1 },
                { opacity: 0 }
            ],
            {
                duration: 180,
                easing: "ease-in",
                fill: "forwards"
            }
        );

        animation.finished
            .catch(() => { })
            .finally(() => {
                finishClose();
            });
    }

    function finishClose() {
        lightbox.hidden = true;

        document.documentElement.classList.remove(
            "lightbox-open"
        );

        image.src = "";

        if (previousButton) {
            previousButton.classList.remove("is-active");
            previousButton.focus();
        }

        previousButton = null;
    }

    function showPrevious() {
        showImage(currentIndex - 1);
    }

    function showNext() {
        showImage(currentIndex + 1);
    }

    buttons.forEach((item, index) => {
        item.button.addEventListener("click", () => {
            openLightbox(index);
        });
    });

    close.addEventListener("click", closeLightbox);
    backdrop.addEventListener("click", closeLightbox);
    prev.addEventListener("click", showPrevious);
    next.addEventListener("click", showNext);

    document.addEventListener("keydown", event => {
        if (lightbox.hidden) {
            return;
        }

        if (event.key === "Escape") {
            closeLightbox();
        }

        if (event.key === "ArrowLeft") {
            showPrevious();
        }

        if (event.key === "ArrowRight") {
            showNext();
        }
    });

    // Swipe support on mobile
    let touchStartX = 0;
    let touchStartY = 0;

    image.addEventListener("touchstart", event => {
        const touch = event.changedTouches[0];

        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }, {
        passive: true
    });

    image.addEventListener("touchend", event => {
        const touch = event.changedTouches[0];

        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;

        if (Math.abs(dx) < 50) {
            return;
        }

        if (Math.abs(dx) < Math.abs(dy)) {
            return;
        }

        if (dx > 0) {
            showPrevious();
        } else {
            showNext();
        }
    }, {
        passive: true
    });
}