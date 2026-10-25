import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDirectVideoFile,
  isOnlineVideo,
  onlineVideoEmbedUrl,
  onlineVideoLabel,
  parseOnlineVideo,
} from '../shared/video.js';

test('YouTube links are recognised in every shape PowerPoint writes', () => {
  const expected = 'CqLxtfkMILA';
  const links = [
    'https://youtu.be/CqLxtfkMILA',
    'https://www.youtube.com/watch?v=CqLxtfkMILA',
    'https://youtube.com/watch?v=CqLxtfkMILA&feature=share',
    'https://m.youtube.com/watch?v=CqLxtfkMILA',
    'https://www.youtube.com/embed/CqLxtfkMILA',
    'https://www.youtube.com/v/CqLxtfkMILA?version=3&autoplay=1',
    'https://www.youtube.com/shorts/CqLxtfkMILA',
    'https://www.youtube-nocookie.com/embed/CqLxtfkMILA',
    'https://youtu.be/CqLxtfkMILA?t=90',
  ];
  for (const link of links) {
    const video = parseOnlineVideo(link);
    assert.ok(video, `${link} is recognised`);
    assert.equal(video.provider, 'youtube');
    assert.equal(video.id, expected);
    assert.equal(video.watchUrl, `https://www.youtube.com/watch?v=${expected}`);
    assert.match(video.thumbnailUrl, /img\.youtube\.com\/vi\/CqLxtfkMILA\/hqdefault\.jpg$/);
  }
});

test('start times are read from the query or the fragment', () => {
  assert.equal(parseOnlineVideo('https://youtu.be/CqLxtfkMILA?t=90').start, 90);
  assert.equal(parseOnlineVideo('https://youtu.be/CqLxtfkMILA#t=1m30s').start, 90);
  assert.equal(parseOnlineVideo('https://www.youtube.com/watch?v=CqLxtfkMILA&start=42').start, 42);
  assert.equal(parseOnlineVideo('https://youtu.be/CqLxtfkMILA').start, null);
  assert.equal(parseOnlineVideo('https://youtu.be/CqLxtfkMILA#t=1h2m3s').start, 3723);
});

test('Vimeo and playlist links are recognised too', () => {
  const vimeo = parseOnlineVideo('https://vimeo.com/76979871');
  assert.equal(vimeo.provider, 'vimeo');
  assert.equal(vimeo.id, '76979871');
  assert.equal(vimeo.watchUrl, 'https://vimeo.com/76979871');
  assert.equal(parseOnlineVideo('https://player.vimeo.com/video/76979871').id, '76979871');

  const playlist = parseOnlineVideo('https://www.youtube.com/playlist?list=PL1234567890');
  assert.equal(playlist.provider, 'youtube');
  assert.equal(playlist.id, null);
  assert.equal(playlist.list, 'PL1234567890');
  assert.match(onlineVideoEmbedUrl(playlist), /\/embed\/videoseries\?/);
});

test('non-video links are rejected', () => {
  for (const link of ['', null, undefined, 'not a url', 'ftp://youtube.com/watch?v=x', 'https://example.com/watch?v=CqLxtfkMILA', 'https://www.youtube.com/', 'https://vimeo.com/about']) {
    assert.equal(parseOnlineVideo(link), null, `${link} is not a video`);
    assert.equal(isOnlineVideo(link), false);
  }
  assert.equal(isOnlineVideo('https://youtu.be/CqLxtfkMILA'), true);
});

test('embed URLs carry the player options', () => {
  const plain = onlineVideoEmbedUrl('https://youtu.be/CqLxtfkMILA');
  assert.match(plain, /^https:\/\/www\.youtube-nocookie\.com\/embed\/CqLxtfkMILA\?/);
  assert.match(plain, /autoplay=0/);
  assert.match(plain, /rel=0/);
  assert.match(plain, /playsinline=1/);

  const playing = onlineVideoEmbedUrl('https://youtu.be/CqLxtfkMILA?t=30', { autoplay: true, muted: true });
  assert.match(playing, /autoplay=1/);
  assert.match(playing, /start=30/);
  assert.match(playing, /mute=1/);

  assert.match(onlineVideoEmbedUrl('https://vimeo.com/76979871', { autoplay: true }), /^https:\/\/player\.vimeo\.com\/video\/76979871\?/);
  assert.equal(onlineVideoEmbedUrl('https://example.com/clip.mp4'), null);
});

test('direct video files are told apart from provider links', () => {
  assert.equal(isDirectVideoFile('https://cdn.example.com/clip.mp4'), true);
  assert.equal(isDirectVideoFile('/media/deck/clip.webm?x=1'), true);
  assert.equal(isDirectVideoFile('https://youtu.be/CqLxtfkMILA'), false);
});

test('labels name the provider for the editor', () => {
  assert.equal(onlineVideoLabel('https://youtu.be/CqLxtfkMILA'), 'YouTube video');
  assert.equal(onlineVideoLabel('https://vimeo.com/76979871'), 'Vimeo video');
  assert.equal(onlineVideoLabel('nonsense'), 'Video');
});
