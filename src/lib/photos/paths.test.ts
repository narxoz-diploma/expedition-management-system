import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AVATARS_BUCKET,
  HIKE_PHOTOS_BUCKET,
  avatarPath,
  avatarPathFromUrl,
  hikePhotoPaths,
  publicUrl,
} from "./paths.ts";

const HIKE = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const FILE = "33333333-3333-3333-3333-333333333333";

describe("пути в хранилище", () => {
  it("кладёт снимок в папку похода", () => {
    const p = hikePhotoPaths(HIKE, FILE);
    assert.equal(p.path, `${HIKE}/${FILE}.jpg`);
    assert.equal(p.thumbPath, `${HIKE}/${FILE}-thumb.jpg`);
  });

  it("первым сегментом идёт владелец — на этом держится политика", () => {
    // Политика на storage.objects разбирает split_part(name, '/', 1) как id
    // похода. Если путь начнётся с чего-то другого, загрузка будет
    // отбиваться ошибкой прав, и причина будет неочевидной.
    const p = hikePhotoPaths(HIKE, FILE);
    assert.equal(p.path.split("/")[0], HIKE);
    assert.equal(p.thumbPath.split("/")[0], HIKE);
    assert.equal(avatarPath(USER, FILE).split("/")[0], USER);
  });

  it("миниатюра лежит рядом со снимком, а не в своей папке", () => {
    // Иначе на неё не распространилась бы та же политика.
    const p = hikePhotoPaths(HIKE, FILE);
    assert.equal(
      p.path.slice(0, p.path.lastIndexOf("/")),
      p.thumbPath.slice(0, p.thumbPath.lastIndexOf("/")),
    );
  });

  it("каждая загрузка даёт новое имя, а не перезаписывает", () => {
    // Перезапись по одному адресу оставила бы человека со старым аватаром в
    // кэше браузера и CDN.
    const a = hikePhotoPaths(HIKE, "aaaa");
    const b = hikePhotoPaths(HIKE, "bbbb");
    assert.notEqual(a.path, b.path);
  });

  it("собирает публичный адрес", () => {
    assert.equal(
      publicUrl("https://abc.supabase.co", HIKE_PHOTOS_BUCKET, `${HIKE}/x.jpg`),
      `https://abc.supabase.co/storage/v1/object/public/hike-photos/${HIKE}/x.jpg`,
    );
  });

  it("не сдваивает косую черту, если адрес пришёл со слэшем на конце", () => {
    assert.equal(
      publicUrl("https://abc.supabase.co/", AVATARS_BUCKET, "u/x.jpg"),
      "https://abc.supabase.co/storage/v1/object/public/avatars/u/x.jpg",
    );
  });
});

describe("путь аватара из адреса", () => {
  it("вынимает путь из своего адреса", () => {
    assert.equal(
      avatarPathFromUrl(
        `https://abc.supabase.co/storage/v1/object/public/avatars/${USER}/${FILE}.jpg`,
      ),
      `${USER}/${FILE}.jpg`,
    );
  });

  it("не трогает аватар от Google", () => {
    // У большинства в avatar_url лежит ссылка на lh3.googleusercontent.com —
    // удалять по ней нечего, и запрос был бы бессмысленным.
    assert.equal(
      avatarPathFromUrl("https://lh3.googleusercontent.com/a/ACg8ocK..."),
      null,
    );
  });

  it("не путает бакеты", () => {
    assert.equal(
      avatarPathFromUrl(
        "https://abc.supabase.co/storage/v1/object/public/hike-photos/x/y.jpg",
      ),
      null,
    );
  });

  it("не отдаёт пустой путь", () => {
    assert.equal(
      avatarPathFromUrl("https://abc.supabase.co/storage/v1/object/public/avatars/"),
      null,
    );
  });
});
