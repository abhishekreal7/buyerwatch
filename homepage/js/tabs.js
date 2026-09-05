/* ==========================================================================
   FOUR DISCIPLINES INTERACTIVE TABS
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = document.querySelectorAll('.discipline-tab-btn');
  const artworkImg = document.getElementById('disciplineArtworkImg');
  const artworkVideo = document.getElementById('disciplineArtworkVideo');
  const artworkCaption = document.getElementById('disciplineArtworkCaption');

  const tabData = {
    '01': {
      title: 'Monitor',
      caption: 'Track the communities, keywords, competitors, and buying language that matter to your business.',
      src: 'images/workflow-monitor.webm',
      isVideo: true
    },
    '02': {
      title: 'Qualify',
      caption: 'Score every match from 0 to 100 using relevance, buying language, and the surrounding conversation context.',
      src: 'images/workflow-qualify.mp4',
      isVideo: true
    },
    '03': {
      title: 'Draft',
      caption: 'Prepare a helpful reply grounded in the original thread, your product context, and your preferred writing style.',
      src: 'images/workflow-draft.webm',
      isVideo: true
    },
    '04': {
      title: 'Deliver',
      caption: 'Review and send manually or use guarded delivery, with the source, attempt, and outcome kept together.',
      src: 'images/workflow-deliver.webm',
      isVideo: true
    }
  };

  function displayMedia(data) {
    if (data.isVideo && artworkVideo) {
      artworkVideo.src = data.src;
      artworkVideo.style.display = 'block';
      artworkVideo.style.opacity = '1';
      artworkVideo.style.transform = 'scale(1)';
      artworkVideo.play().catch(() => {});
      if (artworkImg) artworkImg.style.display = 'none';
    } else if (artworkImg) {
      artworkImg.src = data.src;
      artworkImg.style.display = 'block';
      artworkImg.style.opacity = '1';
      artworkImg.style.transform = 'scale(1)';
      if (artworkVideo) {
        artworkVideo.style.display = 'none';
        artworkVideo.pause();
      }
    }
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (!tabId || !tabData[tabId]) return;

      // Update active state
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Transition artwork
      if (artworkImg) artworkImg.style.opacity = '0';
      if (artworkVideo) artworkVideo.style.opacity = '0';

      setTimeout(() => {
        displayMedia(tabData[tabId]);
      }, 150);

      if (artworkCaption) {
        artworkCaption.style.opacity = '0';
        setTimeout(() => {
          artworkCaption.textContent = tabData[tabId].caption;
          artworkCaption.style.opacity = '1';
        }, 150);
      }
    });
  });
});
