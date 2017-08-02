/* Copyright 2013 Chris Wilson

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = new AudioContext();
var audioInput = null,
    realAudioInput = null,
    inputPoint = null,
    audioRecorder = null;
var rafID = null;
var analyserContext = null;
var canvasWidth, canvasHeight;
var recIndex = 0;
var isRecording = false;
var currentBuffers = [];
var currentBlob;

/* TODO:

- offer mono option
- "Monitor input" switch
*/

function saveAudio() {
    audioRecorder.exportWAV( doneEncoding );
    // could get mono instead by saying
    // audioRecorder.exportMonoWAV( doneEncoding );
}

function gotBuffers( buffers ) {
    currentBuffers = buffers;
    var canvas = document.getElementById( "wavedisplay" );

    // the ONLY time gotBuffers is called is right after a new recording is completed -
    // so here's where we should set up the download.
    audioRecorder.exportMonoWAV( doneEncoding );
}

function doneEncoding( blob ) {
    currentBlob = blob;
    Recorder.setupDownload( blob, "myRecording" + ((recIndex<10)?"0":"") + recIndex + ".wav" );
    recIndex++;
}

function toggleRecording( e ) {
    if (isRecording) {
        // stop recording
        audioRecorder.stop();
        isRecording = false;
        audioRecorder.getBuffers( gotBuffers );
        $('#stopButton').prop('disabled', true);
        $('#recordButton').prop('disabled', false);
        $('#playButton').prop('disabled', false);
        $('#submitButton').prop('disabled', false);
    } else {
        // start recording
        if (!audioRecorder)
            return;
        isRecording = true;
        audioRecorder.clear();
        audioRecorder.record();
        $('#stopButton').prop('disabled', false);
        $('#recordButton').prop('disabled', true);
    }
}

function convertToMono( input ) {
    var splitter = audioContext.createChannelSplitter(2);
    var merger = audioContext.createChannelMerger(2);

    input.connect( splitter );
    splitter.connect( merger, 0, 0 );
    splitter.connect( merger, 0, 1 );
    return merger;
}

function cancelAnalyserUpdates() {
    window.cancelAnimationFrame( rafID );
    rafID = null;
}

function toggleMono() {
    if (audioInput != realAudioInput) {
        audioInput.disconnect();
        realAudioInput.disconnect();
        audioInput = realAudioInput;
    } else {
        realAudioInput.disconnect();
        audioInput = convertToMono( realAudioInput );
    }

    audioInput.connect(inputPoint);
}

function gotStream(stream) {
    inputPoint = audioContext.createGain();

    // Create an AudioNode from the stream.
    realAudioInput = audioContext.createMediaStreamSource(stream);
    audioInput = realAudioInput;
    audioInput.connect(inputPoint);

//    audioInput = convertToMono( input );

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    inputPoint.connect( analyserNode );

    audioRecorder = new Recorder( inputPoint );

    zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0.0;
    inputPoint.connect( zeroGain );
    zeroGain.connect( audioContext.destination );
    updateAnalysers();
}

function initAudio() {
        if (!navigator.getUserMedia)
            navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        if (!navigator.cancelAnimationFrame)
            navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
        if (!navigator.requestAnimationFrame)
            navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;

    navigator.getUserMedia(
        {
            "audio": {
                "mandatory": {
                    "googEchoCancellation": "false",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": []
            },
        }, gotStream, function(e) {
            alert('Error getting audio');
            console.log(e);
        });
}

function initButtons() {
    $('#stopButton').prop('disabled', true);
    $('#recordButton').prop('disabled', false);
    $('#playButton').prop('disabled', true);
    $('#stopPlaybackButton').prop('disabled', true);
    $('#submitButton').prop('disabled', true);
    initAudio();

    currentBuffers = null;
    currentBlob = null;
}

var playIsFinished = false;

function onEnded() {
    playIsFinished = true;

    $('#playButton').prop('disabled', false);
    $('#stopPlaybackButton').prop('disabled', true);
}

var newSource;

function play() {
    newSource = audioContext.createBufferSource();
    var newBuffer = audioContext.createBuffer( 2, currentBuffers[0].length, audioContext.sampleRate );
    newBuffer.getChannelData(0).set(currentBuffers[0]);
    newBuffer.getChannelData(1).set(currentBuffers[1]);
    newSource.buffer = newBuffer;

    newSource.connect( audioContext.destination );
    newSource.start(0);
    $('#playButton').prop('disabled', true);
    $('#stopPlaybackButton').prop('disabled', false);

    newSource.onended = onEnded
}

function stopPlay() {
    newSource.stop()
}

function guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}

function submitToS3() {
    var albumBucketName = 'kbot.cmusphinx.records';
    var bucketRegion = 'us-west-2';

    AWS.config.update({
        region: bucketRegion,
        credentials: new AWS.Credentials({
            accessKeyId: "AKIAI525SJAWPDK6VE4Q",
            secretAccessKey: "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",
        })
    });

    var s3 = new AWS.S3({
        apiVersion: '2006-03-01',
        params: {Bucket: albumBucketName}
    });

    var params = {
        Bucket: albumBucketName,
        Key: guid() + ".wav",
        Body: currentBlob,
        ACL: 'private',
        ContentType: 'audio/wav'
    };
    s3.putObject(params, function(err,data){
        $('#submittedAlert').fadeIn();
        $('#submittedAlert').delay(5000).fadeOut();

        initButtons();
    } );
}

window.addEventListener('load', initButtons );
