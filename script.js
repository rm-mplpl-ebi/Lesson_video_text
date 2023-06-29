/* eslint-disable require-jsdoc */
'use strict'

$(function() {
  // PeerJSオブジェクトを作成する
  // keyとdebugのプロパティを使用してPeerオブジェクトのオプションを設定する
  const peer = new Peer({
    key:   "644d53b1-40c1-478d-8497-b57cf15a5737",
    debug: 3,
  });

  let localStream;
  let room;

  // Peerオブジェクトが接続を開く(openする)ときのハンドラ
  peer.on('open', () => {
    $('#my-id').text(peer.id); // IDを表示

    // 初期化ステップ1を呼び出す
    step1();
  });

  // Peerオブジェクトがエラーを検出したときのハンドラ
  peer.on('error', err => {
    alert(err.message);

    // エラー発生時はステップ2を呼び出す
    step2();
  });

  // make-call fromが送信されたときのハンドラ
  $('#make-call').on('submit', e => {
    e.preventDefault(); // デフォルトのform送信動作をキャンセル

    // ルーム名を取得して通話を開始する
    const roomName = $('#join-room').val();
    if (!roomName) {
      return;
    }

    // ルームに参加する．取得したlocalStreamを使用する
    room = peer.joinRoom('mesh_multi_' + roomName, {stream: localStream});

    $('#room-id').text(roomName); // ルーム名を表示
    // ステップ3を呼び出す
    step3(room);
  });

  // end-callボタンがクリックされた時のハンドラ
  $('#end-call').on('click', () => {
    $('#chatbox-'+room.name).hide() // 切断時にチャットボックスを隠す
    room.close(); // ルームを閉じる
    //ステップ2を呼び出す
    step2();
  });

  // getUserMediaが失敗した場合のリトライボタンのハンドラ
  $('#step1-retry').on('click', () => {
    $('#step1-error').hide(); // エラーメッセージを非表示にする
    step1(); // ステップ1を再試行する
  });

  // オーディオとビデオのn風力ソースセレクタの設定
  const audioSelect = $('#audioSource');
  const videoSelect = $('#videoSource');
  const selectors = [audioSelect, videoSelect];

  // 利用可能なメディアデバイの一覧を取得
  navigator.mediaDevices.enumerateDevices()
    .then(deviceInfos => {
      const values = selectors.map(select => select.val() || '');
      selectors.forEach(select => {
        const children = select.children(':first');
        while (children.length) {
          select.remove(children); // セレクタの既存のオプションを削除
        }
      });

      for (let i = 0; i !== deviceInfos.length; ++i) {
        const deviceInfo = deviceInfos[i];
        const option = $('<option>').val(deviceInfo.deviceId);

        // オーディオ入力デバイスの場合
        if (deviceInfo.kind === 'audioinput') {
          option.text(deviceInfo.label ||
            'Microphone ' + (audioSelect.children().length + 1));
          audioSelect.append(option);
        } else if (deviceInfo.kind === 'videoinput') { // ビデオ入力デバイスの場合
          option.text(deviceInfo.label ||
            'Camera ' + (videoSelect.children().length + 1));
          videoSelect.append(option);
        }
      }

      // セレクタが以前に選択したデバイスを指定している場合はその選択を維持
      selectors.forEach((select, selectorIndex) => {
        if (Array.prototype.slice.call(select.children()).some(n => {
            return n.value === values[selectorIndex];
          })) {
          select.val(values[selectorIndex]);
        }
      });

      // オーディオ，またはビデオのソースが変更された場合にステップ1を再実行
      videoSelect.on('change', step1);
      audioSelect.on('change', step1);
    });

  function step1() {
    // getUserMediaを使用してオーディオとビデオのストリームを取得
    const audioSource = $('#audioSource').val();
    const videoSource = $('#videoSource').val();
    const constraints = {
      audio: {deviceId: audioSource ? {exact: audioSource} : undefined},
      video: {deviceId: videoSource ? {exact: videoSource} : undefined},
    };
    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
      $('#my-video').get(0).srcObject = stream;
      localStream = stream;
      
      if (room) {
        room.replaceStream(stream);
        return;
      }
    }).catch(err => {
        $('#step1-error').show(); // ここのエラーハンドリングの処理から追加部分
        console.error(err);
    });

    // getUserMediaを使用してオーディオとビデオのストリームを取得
    // ここは2台目カメラ用，音声は2ついらないのでオフにしておく
    const videoSource2 = $('#videoSource2').val();
    const constraints2 = {
        audio: false,  // Only get the video
        video: { deviceId: videoSource2 ? { exact: videoSource2 } : undefined },
    };
    navigator.mediaDevices.getUserMedia(constraints2).then(stream => {
        $('#my-second-video').get(0).srcObject = stream;
    }).catch(err => {
        console.error(err);
    });
    //ここまで
      step2();
  }

  function step2() {
    // UIの切り替え
    $('#their-videos').empty();
    $('#step1, #step3').hide();
    $('#step2').show();
    $('#join-room').focus();
  }

  function step3(room) {
    // チャットボックスの設定，メッセージ送信のハンドラ，チャットメッセージやストリームが届いた時のハンドラ
    const chatbox = $('<div></div>').addClass('chatbox').attr('id', 'chatbox'+room.name);
    const header = $('<h4></h4>').html('Room: <strong>' + room.name + '</strong>');
    const messages = $('<div><em>Peer connected.</em></div>').addClass('messages');

    chatbox.append(header);
    chatbox.append(messages);
    $('#chatframe').append(chatbox);

    // メッセージ送信部分
    $('#sendtextform').on('submit', e => {
      e.preventDefault(); // form送信を抑制
      const msg = $('#mymessage').val();
      // ルームに送って自分のところにも反映
      room.send(msg);
      messages.prepend('<div id="mess"><span class="you">You: </span>' + msg + '</div>');
      $('#mymessage').val('&#x1f92c;'); //今はvalに絵文字入ってます，デフォルトで空欄にするなら空にしてあげてくだ際
    });

    // チャットとかファイルが飛んできたらdataでonになる
    // ここではファイルは使わないのでもとのサンプルのif文はけしておく
    room.on('data', message => {
      messages.prepend('<div><span class="peer">' + message.src.substr(0,8) + '</span>: ' + message.data + '</div>');
    });

    room.on('peerJoin', peerId => {
      messages.prepend('<div><span class="peer">' + peerId.substr(0,8) + '</span>: has joined the room </div>');
    });

    room.on('peerLeave', peerId => {
      messages.prepend('<div><span class="peer">' + peerId.substr(0,8) + '</span>: has left the room </div>');
    });

    // streamが飛んできたら相手の画面を追加する
    room.on('stream', stream => {
      const peerId = stream.peerId;
      const id = 'video_' + peerId + '_' + stream.id.replace('{', '').replace('}', '');

      $('#their-videos').append($(
        '<div class="video_' + peerId +'" id="' + id + '">' +
          '<label>' + stream.peerId + ':' + stream.id + '</label>' +
          '<video class="remoteVideos" autoplay playsinline>' +
        '</div>'));
      const el = $('#' + id).find('video').get(0);
      el.srcObject = stream;
      el.play();
    });

    room.on('removeStream', function(stream) {
      const peerId = stream.peerId;
      $('#video_' + peerId + '_' + stream.id.replace('{', '').replace('}', '')).remove();
    });

    // UI stuff
    room.on('close', step2);
    room.on('peerLeave', peerId => {
      $('.video_' + peerId).remove();
    });
    $('#step1, #step2').hide();
    $('#step3').show();
  }
});
