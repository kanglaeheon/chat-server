/*  Firebase 펑션 SDK 임포트
    HTTP 요청 일으키기 위해 사용 */
const functions = require('firebase-functions');

/*  Firebase 어드민 SDK 임포트
    실시간 데이터베이스 처리 및 인증을 수행하기 위해 사용 
    admin.initializeApp 부분에서 admin 인스턴스 초기화  */
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

/* Express 모듈 임포트, app 이름으로 인스턴스 생성 */
const express = require('express');
const app = express();

/* cors(Cross Origin Resource Sharing) 모듈 임포트, app에 로드 
    Cross Domain 이슈를 방지
    (서버 디플로이된 포트와 요청 받는 API 포트가 꼬이는 것 방지) */
const cors = require('cors');
app.use(cors);

/* 테스트용 document 데이터 json 생성 */
const anonymousUser = {
    id: "anon",
    name: "Anonymous",
    avatar: ""
};

/* checkUser() : 사용자 정보 알아내기 함수 */
const checkUser = (req, res, next) => {
    req.user = anonymousUser;
    if (req.query.auth_token !== undefined) {
        //  idToken => 인증을 마친 사용자의 accessToken
        let idToken = req.query.auth_token;
        //  사용자 검증
        //  어드민 SDK의 .auth().verifyIdToken() 메서드 이용
        //  verifyIdToken 인자로 idToken 넘겨주기
        admin.auth()
        .verifyIdToken(idToken)
        //  검증 성공시 decodedIdToken 반환, 각 필드 획득하여
        //  authUser 객체 만든다
        .then(decodedIdToken => {
            let authUser = {
                id: decodedIdToken.user_id,
                name: decodedIdToken.name,
                avatar: decodedIdToken.picture
            };
            //  req객체의 user 필드 값으로 authUser 설정후
            //  해당 요청을 next() 메서드로 다음 라우터로 진행시킨다
            req.user = authUser;
            next();
        }).catch(error => {
            next();
        });
    } else {
        //  anonymousUser 객체가 그대로 user 필드 값으로 설정된 후 진행
        next();
    };
};
//  사용자 정보 알아내기 함수 호출
app.user(checkUser);

function createChannel(cname) {
    /* 어드민 SDK의 admin.database() 메서드로 데이터 베이스 조작,
    .ref() 메서드로 channels 노드 참조 */
    let channelsRef = admin.database().ref('channels');
    let date1 = new Date();
    let date2 = new Date();
    date2.setSeconds(date2.getSeconds() + 1);
    //  쿼리문 수행
    const defaultData = `{
        "messages" : {
            "1" : {
                "body" : "Welcome to #${cname} channel!",
                "date" : "${date1.toJSON()}",
                "user" : {
                    "avatar" : "",
                    "id" : "robot",
                    "name" : "Robot"
                }
            },
            "2" : {
                "body" : "채널 생성 완료!!",
                "date" : "${date2.toJSON()}",
                "user" : {
                    "avatar" : "",
                    "id" : "robot",
                    "name" : "Robot"
                }
            }
        }
    }`;
    //  child() : 참조 대상의 자식 노드 참조
    //  set()   : 데이터 추가
    //  JSON형태인 defaultData 파싱하여 'channels'의 자식 노드에 set
    channelsRef.child(cname).set(JSON.parse(defaultData));
}

/* /channels에 POST 요청시 처리 */
//  요청 바디에 cname으로 채널 생성 후 성공 시 result: 'ok'
app.post('/channels', (req, res) => {
    let cname = req.body.cname;
    createChannel(cname);
    res.header('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({result: 'ok'});
});

/* 채널 목록 확인 GET 요청시 처리 API */
//  value 이벤트를 사용하여 데이터 읽어오기
app.get('/channels', (req, res) => {
    let channelsRef = admin.database().ref('channels');
    //  once() : 한 번 콜백
    channelsRef.once('value', function(snapshot) {
        let items = new Array();
        //  빈 배열에 cname의 자식 DatabaseSnapshot을 iterating
        snapshot.forEach(function(childSnapshot) {
            let cname = childSnapshot.key;
            items.push(cname);
        });
        //  응답으로 json 전송
        res.header('Content-Type', 'application/json; charset=utf-8');
        res.send({channels: items});
    });
});

/*  지정한 채널에 새 메시지 추가 API
    :cname에서 요청 POST가 오면 이 경로가 가리키는 위치에 있는 값을
    req.param.cname에 설정.
    .push() 메서드로 Message 객체를 channels/${cname}/messages 경로에 설정 */
app.post('/channels/:cname/messages', (req, res) => {
    let cname = req.params.cname;
    let message = {
        date: new Date().toJSON(),
        body: req.body.body,
        user: req.user
    };
    //  orderbyChild(key)   : 지정된 하위 키를 포함하는 데이터가 정렬
    //  limitToLast(value)  : value 값만큼의 개수만 데이터 수신하여 콜백 동기화
    let messagesRef = admin.database().ref(`channels/${cname}/messages`).orderByChild(date).limitToLast(20);
    messagesRef.push(message);
    res.header('Content-Type', 'application/json; charset=utf-8');
    res.status(201).send({result: 'ok'});
});

/* 채널 내 메시지 목록을 확인하는 API */
app.get('/channels/:cname/messages', (req, res) => {
    let cname = req.params.cname;
    let messagesRef = admin.database().ref(`channels/${cname}/messages`).orderByChild(date).limitToLast(20);
    messagesRef.once('value', function(snapshot) {
        let items = new Array();
        snapshot.forEach(function(childSnapshot) {
            // val() : 스냅샷에 데이터가 없을 경우 null 반환을 위함
            let message = childSnapshot.val();
            message.id = childSnapshot.key;
            items.push(message);
        });
        items.reverse();
        res.header('Content-Type', 'application/json; charset=utf-8');
        res.send({messages: items});
    });
});

/* 초기 상태로 되돌리기 :
    general, random 채널 생성 */
app.post('/reset', (req, res) => {
    createChannel('general');
    createChannel('random');
    res.header('Content-Type', 'application/json; charset=utf-8');
    res.status(201).send({result: "ok"});
});