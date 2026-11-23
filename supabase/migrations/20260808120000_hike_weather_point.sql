-- Точка маршрута и её высота — для прогноза погоды на карточке похода.
--
-- Почему нельзя обойтись тем, что уже есть в таблице:
--
-- meeting_point_url — это точка СБОРА, «у Атакента», Алматы, около 800 м.
-- Прогноз по ней даст городскую погоду, а весь смысл блока ровно обратный:
-- в городе +25, на 2800 мокрый снег, и человек, одевшийся по окну, идёт в
-- горы в кроссовках. Точка маршрута обязана быть отдельной.
--
-- elevation_gain_m — это НАБОР высоты, а не высота. 1200 м набора от 1600 —
-- это 2800 на маршруте, и вывести одно из другого нельзя: стартовая высота
-- нигде не хранится. Поэтому отдельная колонка, а не арифметика.
alter table hikes
  add column route_lat        numeric(8,5),
  add column route_lon        numeric(8,5),
  add column route_altitude_m int;

-- Обе координаты или ни одной. Одна координата — это не «заполнено
-- наполовину», а молчаливо неверная точка: широта Алматы с нулевой долготой
-- укажет в Атлантику, и прогноз придёт, просто чужой.
alter table hikes
  add constraint hikes_route_point_complete
  check ((route_lat is null) = (route_lon is null));

-- Высота обязательна вместе с координатами. Без неё Open-Meteo возьмёт
-- высоту своей ячейки сетки — в горах она промахивается на сотни метров, —
-- и подписать блок будет нечем, а подпись с высотой здесь обязательна.
alter table hikes
  add constraint hikes_route_altitude_with_point
  check (route_lat is null or route_altitude_m is not null);

alter table hikes
  add constraint hikes_route_lat_range
  check (route_lat is null or route_lat between -90 and 90);

alter table hikes
  add constraint hikes_route_lon_range
  check (route_lon is null or route_lon between -180 and 180);

-- Верхняя граница — с запасом над Хан-Тенгри: поле заполняется руками, и
-- лишний ноль в «2800» должен отбиваться базой, а не уезжать в прогноз.
alter table hikes
  add constraint hikes_route_altitude_range
  check (route_altitude_m is null or route_altitude_m between 0 and 9000);

-- RLS не трогается намеренно: политики hikes работают на уровне строки и
-- покрывают таблицу целиком, новые колонки попадают под них сами. Точка
-- маршрута не персональные данные — её видит тот же, кто видит поход.
