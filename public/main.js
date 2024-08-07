const form = document.getElementById("room-name-form");
const roomNameInput = document.getElementById("room-name-input");
const userNameInput = document.getElementById("user-name-input");
const container = document.getElementById("video-container");
const sharecontainer = document.getElementById("sharescreen-container");
const chatdiv = document.getElementById("chatdiv");
let groom = null;
let gtoken = null;
let localdataTrack = null;
let localShareTrack = null;
let userName = null;

const startRoom = async (event) => {
  // prevent a page reload when a user submits the form
  event.preventDefault();
  // hide the join form
  form.style.visibility = "hidden";
  // retrieve the room name
  const roomName = roomNameInput.value;
  userName = userNameInput.value;

  // fetch an Access Token from the join-room route
  const response = await fetch("/join-room", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roomName: roomName, userName: userName }),
  });
  const { token } = await response.json();
  gtoken = token;
  // join the video room with the token
  const room = await joinVideoRoom(roomName, token);
  groom = room;
  //console.log(groom);

  setNetworkQualityConfiguration(room, 1, 1);
  setupNetworkQualityUpdates(room, handleQTReport);
  setupDominantSpeakerUpdates(room, handledominant);

  // render the local and remote participants' video and audio tracks
  handleConnectedParticipant(room.localParticipant);
  room.participants.forEach(handleConnectedParticipant);
  room.on("participantConnected", handleConnectedParticipant);

  // handle cleanup when a participant disconnects
  room.on("participantDisconnected", handleDisconnectedParticipant);
  window.addEventListener("pagehide", () => room.disconnect());
  window.addEventListener("beforeunload", () => room.disconnect());
};

const handledominant = (participant) => {
  console.log("dominant changed to: ", participant.identity);
  [...document.getElementsByClassName("active")].forEach((el) => {
    // Do something with each element
    // console.log("removing class", el);
    el.classList.remove("active");
  });

  const p = document.getElementById(participant.identity);
  // console.log("adding class", p);
  p.classList.add("active");
};

const handleQTReport = (evt) => {
  console.log(evt);
};

const handleShareScreen = async (btnId) => {
  const btn = document.getElementById(btnId);
  if (btn.textContent === "Stop Sharing") {
    btn.textContent = "Share Screen";
    groom.localParticipant.unpublishTrack(localShareTrack);
    localShareTrack.stop();
    sharecontainer.innerHTML = "";
    localShareTrack = null;
    // const mediaElements = localShareTrack.detach();
    // mediaElements.forEach(mediaElement => mediaElement.remove());
  } else {
    localShareTrack = await createScreenTrack(720, 720);
    localShareTrack.attach(sharecontainer);
    // Publish screen track to room
    groom.localParticipant.publishTrack(localShareTrack);
    btn.textContent = "Stop Sharing";
  }
};

const handlechat = async () => {
  localdataTrack = await connectToRoomWithDataTrack(gtoken, groom);
  groom.localParticipant.publishTrack(localdataTrack);
  const btn = document.getElementById(`Chat${groom.localParticipant.identity}`);
  btn.disabled = true;
  chatdiv.style.display = "block";
};

function sendMsg(evt) {
  const msgbox = document.getElementById(
    `chatinput${groom.localParticipant.identity}`
  );
  chatdiv.appendChild(createMessages(`${userName}`, msgbox.value));
  sendChatMessage(localdataTrack, msgbox.value);
  msgbox.value = "";
}

// Appends text to DOM
function appendText(text, participant) {
  chatdiv.appendChild(createMessages(`${participant.identity}`, text));
  chatdiv.scrollTop = chatdiv.scrollHeight;
}

const handleConnectedParticipant = (participant) => {
  // create a div for this participant's tracks
  const participantDiv = document.createElement("div");
  participantDiv.setAttribute("id", participant.identity);
  const participantControls = document.createElement("div");

  const islocalParticipant =
    participant.identity === groom.localParticipant.identity;
  if (islocalParticipant) {
    const participantMuteAudio = document.createElement("button");
    participantMuteAudio.id = `Audio${participant.identity}`;
    participantMuteAudio.textContent = "Mute";
    participantMuteAudio.addEventListener("click", togglemute);

    const participantMuteVideo = document.createElement("button");
    participantMuteVideo.id = `Video${participant.identity}`;
    participantMuteVideo.textContent = "Hide";
    participantMuteVideo.addEventListener("click", togglevideo);

    const sharescreen = document.createElement("button");
    sharescreen.setAttribute("id", `Share${participant.identity}`);
    sharescreen.textContent = "Share Screen";
    sharescreen.addEventListener("click", () =>
      handleShareScreen(sharescreen.id)
    );

    const participantChat = document.createElement("button");
    participantChat.id = `Chat${participant.identity}`;
    participantChat.textContent = "JoinChat";
    participantChat.addEventListener("click", handlechat);

    const localchat = document.createElement("div");
    localchat.id = `DivChat${participant.identity}`;
    localchat.style.display = "none";

    const chattxt = document.createElement("input");
    chattxt.id = `chatinput${groom.localParticipant.identity}`;
    localchat.appendChild(chattxt);

    const chatbtn = document.createElement("button");
    chatbtn.id = `Chatbtn${groom.localParticipant.identity}`;
    chatbtn.textContent = "Send";
    chatbtn.addEventListener("click", sendMsg);
    localchat.appendChild(chatbtn);

    participantControls.appendChild(participantMuteAudio);
    participantControls.appendChild(participantMuteVideo);
    participantControls.appendChild(sharescreen);
    participantControls.appendChild(participantChat);
    participantDiv.appendChild(localchat);
  }
  container.appendChild(participantControls);
  container.appendChild(participantDiv);

  // iterate through the participant's published tracks and
  // call `handleTrackPublication` on them
  participant.tracks.forEach((trackPublication) => {
    handleTrackPublication(trackPublication, participant);
  });

  // listen for any new track publications
  participant.on("trackPublished", (track) =>
    handleTrackPublication(track, groom.localParticipant)
  );

  participant.on("trackUnpublished", (track) => {
    handleTrackUnpublish(track);
  });
};

const handleTrackUnpublish = (track) => {
  if (track.trackName.includes("ShareScreen")){
    sharecontainer.innerHTML = "";
  }
};

//const handleTrackPublication = (trackPublication, participant) => {
const handleTrackPublication = (trackPublication, participant) => {
  function displayTrack(track) {
    // append this track to the participant's div and render it on the page
    const participantDiv = document.getElementById(participant.identity);
    // track.attach creates an HTMLVideoElement or HTMLAudioElement
    // (depending on the type of track) and adds the video or audio stream
    if (track.kind === "data") {
      if (localdataTrack) {
        if (localdataTrack.id === track.id) {
          const localchat = document.getElementById(
            `DivChat${groom.localParticipant.identity}`
          );
          localchat.style.display = "block";
          receiveChatMessages(groom, appendText);
        }
      }
    } else if (track.kind === "video" && track.name.includes("ShareScreen")) {
      sharecontainer.append(track.attach());
    } else {
      participantDiv.append(track.attach());
    }
  }

  // check if the trackPublication contains a `track` attribute. If it does,
  // we are subscribed to this track. If not, we are not subscribed.
  if (trackPublication.track) {
    displayTrack(trackPublication.track);
  }

  // listen for any new subscriptions to this track publication
  trackPublication.on("subscribed", displayTrack);
};

const handleDisconnectedParticipant = (participant) => {
  // stop listening for this participant
  participant.removeAllListeners();
  // remove this participant's div from the page
  const participantDiv = document.getElementById(participant.identity);
  participantDiv.remove();
};

const joinVideoRoom = async (roomName, token) => {
  // join the video room with the Access Token and the given room name
  const room = await Twilio.Video.connect(token, {
    room: roomName,
    dominantSpeaker: true,
    // networkQuality: {
    //   local: localVerbosity,
    //   remote: remoteVerbosity
    // }
  });
  return room;
};

const togglemute = (e) => {
  //console.log(e.target.id)
  const id = e.target.id;
  const btn = document.getElementById(id);
  if (btn.textContent === "Mute") {
    muteYourAudio(groom);
    btn.textContent = "Unmute";
  } else {
    unmuteYourAudio(groom);
    btn.textContent = "Mute";
  }
};

/**
 * Creates messages for the chat log
 */
function createMessages(fromName, message) {
  const pElement = document.createElement("p");
  pElement.className = "text";
  pElement.classList.add(`${fromName}`);
  pElement.innerText = `${fromName}: ${message}`;
  return pElement;
}

const togglevideo = (e) => {
  //console.log(e.target.id)
  const id = e.target.id;

  const btn = document.getElementById(id);
  if (btn.textContent === "Hide") {
    muteYourVideo(groom);
    btn.textContent = "UnHide";
  } else {
    unmuteYourVideo(groom);
    btn.textContent = "Hide";
  }
};

form.addEventListener("submit", startRoom);
