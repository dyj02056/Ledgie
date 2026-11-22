-- 인증 모듈 전용 역할: 인증 테이블 4개만 다룬다. 역할 자체는 db/run.mts가 AUTH_DB_PASSWORD로 만든다
-- 앱 테이블 권한은 없으므로 소유자 연결이 런타임에 남지 않는다. 사용자 삭제 시 앱 데이터는 FK cascade가 지운다
grant select, insert, update, delete on "user", "session", "account", "verification" to auth_user;
