(function () {
  let channel = null;
  try {
    channel = new BroadcastChannel("shirmo");
  } catch (err) {
    channel = null;
  }

  function touch() {
    if (channel) channel.postMessage({ type: "refresh" });
  }

  function onRefresh(fn) {
    if (!channel) return;
    channel.onmessage = function (event) {
      if (event.data && event.data.type === "refresh") fn();
    };
  }

  window.ShirmoLive = { touch: touch, onRefresh: onRefresh };
})();
