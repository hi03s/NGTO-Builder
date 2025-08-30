var NGTOBuilderVersion = "1.12";

var renderClass = "jp.ngt.rtm.render.VehiclePartsRenderer";
importPackage(Packages.org.lwjgl.opengl);
importPackage(Packages.org.lwjgl.input);
importPackage(Packages.jp.ngt.rtm.render);

//MCTE
importPackage(Packages.jp.ngt.mcte.item);//ItemMiniature

//NGTLib
importPackage(Packages.jp.ngt.ngtlib.util);//NGTUtilClient MCWrapper
importPackage(Packages.jp.ngt.ngtlib.block);//BlockUtil
importPackage(Packages.jp.ngt.ngtlib.io);//NGTLog
importPackage(Packages.jp.ngt.ngtlib.math);//Vec3

//RealTrainMod
importPackage(Packages.jp.ngt.rtm);//RTMCore RTMItem RTMResource
importPackage(Packages.jp.ngt.rtm.item);//ItemInstalledObject
importPackage(Packages.jp.ngt.rtm.rail);//TileEntityLargeRailBase
importPackage(Packages.jp.ngt.rtm.electric);//TileEntityInsulator
importPackage(Packages.jp.ngt.rtm.modelpack);//ModelPackManager
importPackage(Packages.jp.ngt.rtm.rail.util);//RailPosition RailDir

//Minecraft
importPackage(Packages.net.minecraft.util);//EnumFacing


var isOldVer = RTMCore.VERSION.indexOf("1.7.10") >= 0;
var isKaizPatch = RTMCore.VERSION.indexOf("KaizPatch") !== -1;
var isFixRTM = !isOldVer ? Packages.net.minecraftforge.fml.common.Loader.isModLoaded("fix-rtm") : false;
var ignoreItemList = [RTMItem.itemWire, RTMItem.installedObject];

var selectRailListData = new java.util.WeakHashMap();
var bezireListData = new java.util.WeakHashMap();

//#################
//##  Settings  ###
//#################
var cursorMaxDistance = 512;//カーソルの限界距離
//キー設定
var KeyMaps = {
    //オプションキー
    optionKey: Keyboard.KEY_LCONTROL,

    //Yオフセット設定
    offsetUp: Keyboard.KEY_UP,
    offsetDown: Keyboard.KEY_DOWN,

    //分割数変更/架線長変更
    splitIncrease: Keyboard.KEY_RIGHT,
    splitDecrease: Keyboard.KEY_LEFT,

    //ワイヤーを生成する
    build: Keyboard.KEY_RETURN,

    //マーカー全削除
    allDelete: Keyboard.KEY_C,

    //モード切替
    switchMode: Keyboard.KEY_P,

    //Undo
    undo: Keyboard.KEY_Z,

    //ヘルプのON/OFF
    isHideHelp: Keyboard.KEY_H,

    //終了
    endEdit: Keyboard.KEY_Q,

    //選択ロックのON/OFF
    selectLock: Keyboard.KEY_L
}
//##  Settings END  ###

var langList = ["en_us", "ja_jp"];

function init(par1, par2) {
    body = renderer.registerParts(new Parts("body"));
    line = renderer.registerParts(new Parts("line"));
    lock = renderer.registerParts(new Parts("lock"));
    point = renderer.registerParts(new Parts("point"));
    cursor = renderer.registerParts(new Parts("cursor"));
    lineArrow = renderer.registerParts(new Parts("lineArrow"));
    debugLine = renderer.registerParts(new Parts("debugLine"));
    debugPoint = renderer.registerParts(new Parts("debugPoint"));
    line_cursor = renderer.registerParts(new Parts("line_cursor"));
    selectObject = renderer.registerParts(new Parts("selectObject"));
    selectedObject = renderer.registerParts(new Parts("selectedObject"));
    distanceMarker = renderer.registerParts(new Parts("distanceMarker"));
    selectInsulator = renderer.registerParts(new Parts("selectInsulator"));
    line_railSelect = renderer.registerParts(new Parts("line_railSelect"));
    line_railSelectable = renderer.registerParts(new Parts("line_railSelectable"));
    selectedInsulator = renderer.registerParts(new Parts("selectedInsulator"));
    line_railSelected = renderer.registerParts(new Parts("line_railSelected"));
    distanceDisplay = [];
    for (var i = 0; i <= 9; i++) {
        distanceDisplay[i] = renderer.registerParts(new Parts("distance_" + i));
    }
    distanceDisplayM = renderer.registerParts(new Parts("distance_M"));

    help = {};
    langList.forEach(function (lang) {
        help[lang] = [];
        for (var i = 0; i <= 1; i++) {
            help[lang][i] = renderer.registerParts(new Parts("help" + i + "_" + lang));
        }
    });
}

function render(entity, pass, par3) {
    if (pass !== 0) return;

    GL11.glPushMatrix();
    body.render(renderer);
    GL11.glPopMatrix();
    if (!entity) return;

    var dataMap = entity.getResourceState().getDataMap();
    var isOpenGUI = NGTUtilClient.getMinecraft().field_71462_r !== null;
    var world = entity.field_70170_p;
    var posX = MCWrapper.getPosX(entity);
    var posY = MCWrapper.getPosY(entity);
    var posZ = MCWrapper.getPosZ(entity);
    //var yaw = MCWrapper.getYaw(entity); //yawはサーバー側で0に固定
    var player = MCWrapperClient.getPlayer();
    var offset = dataMap.getInt("offset");
    var wireCount = dataMap.getInt("wireCount");
    var wireLength = dataMap.getDouble("wireLength");
    var isRailSplitMode = dataMap.getBoolean("isRailSplitMode");
    var isPushOptionKey = Keyboard.isKeyDown(KeyMaps.optionKey);
    var lookingBlockPos = getLookingPos(world, offset, isPushOptionKey);
    var hostPlayerEntityId = dataMap.getString("hostPlayerEntityId");
    var hostPlayer = null;
    if (hostPlayerEntityId !== "") hostPlayer = world.func_73045_a(hostPlayerEntityId);
    var isLeftClick = Mouse.isButtonDown(0);
    var isRightClick = Mouse.isButtonDown(1);
    var isSelectLock = dataMap.getBoolean("selectLock");
    if (isSelectLock){
        isLeftClick = false;
        isRightClick = false;
    }
    var VERSIONS_server = dataMap.getString("VERSIONS");
    if (VERSIONS_server === "") VERSIONS_server = "~ 1.3";
    var isVersionChecked = dataMap.getBoolean("isVersionChecked");
    var isHideHelp = dataMap.getBoolean("isHideHelp");

    doFollowing(entity, hostPlayer);//1.12用

    if (hostPlayer) {
        //初期化
        var isInitialized = dataMap.getBoolean("isInitialized");
        if (!isInitialized) {
            dataMap.setBoolean("isInitialized", true, 0);
            offset = 5;//初期値はW51の高さに合わせてみる
            dataMap.setInt("offset", offset, 1);
            lookingBlockPos = getLookingPos(world, offset, isPushOptionKey);
            dataMap.setInt("wireCount", 1, 1);
            dataMap.setDouble("wireLength", 40, 1);
            dataMap.setBoolean("isRailSplitMode", true, 0);//デフォルトでは等分割モード
        }

        var selectRailList = selectRailListData.get(entity);
        if (!selectRailList) selectRailList = [];

        var selectPosList = [];
        var selectPosList_JSON = dataMap.getString("selectPosList").replace(/☆/g, ",");
        if (selectPosList_JSON !== "") selectPosList = JSON.parse(selectPosList_JSON);

        //操作プレイヤー
        if (hostPlayer === player) {

            var insulatorItem = getItemInsulator(player);
            var insulatorOffsetY = insulatorItem ? getInsulatorY(insulatorItem) : 0;

            //バージョンチェック
            if ((VERSIONS_server != NGTOBuilderVersion) && !isVersionChecked) {
                dataMap.setBoolean("isVersionChecked", true, 0);
                NGTLog.sendChatMessage(hostPlayer, "§c[NGTO Builder]Versions don't match!");
                NGTLog.sendChatMessage(hostPlayer, "§cClient:" + NGTOBuilderVersion);
                NGTLog.sendChatMessage(hostPlayer, "§cServer:" + VERSIONS_server);
            }

            //キー入力関連操作
            var currentItem = getSelectedSlotItem(player);
            isRightClick = isRightClick && !(currentItem && ignoreItemList.indexOf(currentItem.func_77973_b()) > -1);
            var isBuilding = dataMap.getBoolean("isBuilding");
            var isUndo = dataMap.getBoolean("isUndo");
            var prevIsClick = dataMap.getBoolean("prevIsClick");
            if (!prevIsClick && (isLeftClick || isRightClick)) dataMap.setBoolean("prevIsClick", true, 0);
            if (prevIsClick && !isLeftClick && !isRightClick) dataMap.setBoolean("prevIsClick", false, 0);

            if (!isOpenGUI && !isBuilding && !isUndo) {
                //Yオフセット
                var prevInputAnyKey = dataMap.getBoolean("prevInputAnyKey");
                var isKeyDown_up = Keyboard.isKeyDown(KeyMaps.offsetUp);
                var isKeyDown_down = Keyboard.isKeyDown(KeyMaps.offsetDown);
                var isKeyDown_increase = Keyboard.isKeyDown(KeyMaps.splitIncrease);
                var isKeyDown_decrease = Keyboard.isKeyDown(KeyMaps.splitDecrease);
                var isKeyDown_SwitchMode = Keyboard.isKeyDown(KeyMaps.switchMode);
                //↑キー
                if (isKeyDown_up) {
                    dataMap.setBoolean("prevInputAnyKey", true, 0);
                    if (!prevInputAnyKey) {
                        offset += 1;
                        dataMap.setInt("offset", offset, 1);

                        //変更を適用
                        if (selectRailList.length > 0) {
                            selectPosList = createSelectPosFromCoreList(selectRailList, wireLength, world, offset);
                            selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                            dataMap.setString("selectPosList", selectPosList_JSON, 1);
                        }
                    }
                }

                //↓キー
                if (isKeyDown_down) {
                    dataMap.setBoolean("prevInputAnyKey", true, 0);
                    if (!prevInputAnyKey) {
                        offset -= 1;
                        dataMap.setInt("offset", offset, 1);

                        //変更を適用
                        if (selectRailList.length > 0) {
                            selectPosList = createSelectPosFromCoreList(selectRailList, wireLength, world, offset);
                            selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                            dataMap.setString("selectPosList", selectPosList_JSON, 1);
                        }
                    }
                }

                //選択ロック
                var isKeyDown_selectLock = Keyboard.isKeyDown(KeyMaps.selectLock);
                var prevInputKey_selectLock = dataMap.getBoolean("prevInputKey_selectLock");
                if (isKeyDown_selectLock && !prevInputKey_selectLock) {
                    dataMap.setBoolean("prevInputKey_selectLock", true, 0);
                    isSelectLock = !isSelectLock;
                    dataMap.setBoolean("selectLock", isSelectLock, 1);
                    NGTLog.sendChatMessage(player, "Select lock:" + isSelectLock);
                }
                if (!isKeyDown_selectLock && prevInputKey_selectLock) {
                    dataMap.setBoolean("prevInputKey_selectLock", false, 0);
                }

                //モード切替
                if (isKeyDown_SwitchMode) {
                    dataMap.setBoolean("prevInputAnyKey", true, 0);
                    if (!prevInputAnyKey) {
                        isRailSplitMode = !isRailSplitMode;
                        dataMap.setBoolean("isRailSplitMode", isRailSplitMode, 0);
                        if (isRailSplitMode) {
                            //レール分割モード
                            NGTLog.sendChatMessage(player, "Placement Mode: Rail Split");
                            NGTLog.sendChatMessage(player, "Wire split: " + wireCount);
                            var totalWireLength = calcWireLength(selectRailList, world);
                            wireLength = totalWireLength / wireCount;
                            dataMap.setDouble("wireLength", wireLength, 1);
                            //変更を適用
                            selectPosList = createSelectPosFromCoreList(selectRailList, wireLength, world, offset);
                            selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                            dataMap.setString("selectPosList", selectPosList_JSON, 1);
                            NGTLog.sendChatMessage(player, "Wire length: " + Math.round(wireLength) + "m");
                        }
                        else {
                            //長さ指定モード
                            NGTLog.sendChatMessage(player, "Placement Mode: Length Repeat");
                        }
                    }
                }

                //分割増加/架線長増加
                if (isKeyDown_increase && selectRailList.length > 0) {
                    dataMap.setBoolean("prevInputAnyKey", true, 0);
                    if (!prevInputAnyKey) {
                        if (isRailSplitMode) {
                            //分割増加
                            wireCount += 1;
                            dataMap.setInt("wireCount", wireCount, 1);
                            NGTLog.sendChatMessage(player, "Wire split: " + wireCount);
                            var totalWireLength = calcWireLength(selectRailList, world);
                            wireLength = totalWireLength / wireCount;
                            dataMap.setDouble("wireLength", wireLength, 1);
                        }
                        else {
                            //架線長さ増加
                            wireLength = Math.floor(wireLength / 5 + 1) * 5;
                            dataMap.setDouble("wireLength", wireLength, 1);
                            dataMap.setInt("wireCount", 1, 1);
                        }
                        //変更を適用
                        selectPosList = createSelectPosFromCoreList(selectRailList, wireLength, world, offset);
                        selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                        dataMap.setString("selectPosList", selectPosList_JSON, 1);
                        NGTLog.sendChatMessage(player, "Wire length: " + Math.round(wireLength) + "m");
                    }
                }

                //分割減少/架線長減少
                if (isKeyDown_decrease && selectRailList.length > 0) {
                    dataMap.setBoolean("prevInputAnyKey", true, 0);
                    if (!prevInputAnyKey) {
                        if (isRailSplitMode) {
                            //分割減少
                            if (wireCount > 1) {
                                wireCount -= 1;
                                dataMap.setInt("wireCount", wireCount, 1);
                                NGTLog.sendChatMessage(player, "Wire split: " + wireCount);
                                var totalWireLength = calcWireLength(selectRailList, world);
                                wireLength = totalWireLength / wireCount;
                                dataMap.setDouble("wireLength", wireLength, 1);
                                //変更を適用
                                selectPosList = createSelectPosFromCoreList(selectRailList, wireLength, world, offset);
                                selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                                dataMap.setString("selectPosList", selectPosList_JSON, 1);
                                NGTLog.sendChatMessage(player, "Wire length: " + Math.round(wireLength) + "m");
                            }
                        }
                        else {
                            //架線長さ減少
                            if (wireLength > 5) {
                                wireLength = Math.ceil(wireLength / 5 - 1) * 5;
                                dataMap.setDouble("wireLength", wireLength, 1);
                                dataMap.setInt("wireCount", 1, 1);
                                //変更を適用
                                selectPosList = createSelectPosFromCoreList(selectRailList, wireLength, world, offset);
                                selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                                dataMap.setString("selectPosList", selectPosList_JSON, 1);
                                NGTLog.sendChatMessage(player, "Wire length: " + Math.round(wireLength) + "m");
                            }
                        }
                    }
                }
                if (!isKeyDown_up && !isKeyDown_down && !isKeyDown_increase && !isKeyDown_decrease && !isKeyDown_SwitchMode && prevInputAnyKey) {
                    dataMap.setBoolean("prevInputAnyKey", false, 0);
                }

                //座標指定
                if (lookingBlockPos && !prevIsClick) {
                    var tile = getTileEntity(world, lookingBlockPos.posX, lookingBlockPos.posY, lookingBlockPos.posZ);
                    var tileCore = tile instanceof TileEntityLargeRailBase ? tile.getRailCore() : null;
                    if (isRightClick && tileCore) {
                        //レール選択モード(分岐非対応)
                        if ((!isPushOptionKey && selectPosList.length === 0) || selectRailList.length > 0) {
                            if (!(tileCore instanceof TileEntityLargeRailSwitchCore)) {
                                if (selectRailList.length === 0) {
                                    //初回選択
                                    selectRailList.push(tileCore);
                                    selectRailListData.put(entity, selectRailList);

                                    if (isRailSplitMode) {//長さが変わるため
                                        var totalWireLength = calcWireLength(selectRailList, world);
                                        wireLength = totalWireLength / wireCount;
                                        dataMap.setDouble("wireLength", wireLength, 1);
                                    }

                                    //変更を適用
                                    if (selectRailList.length > 0) {
                                        selectPosList = createSelectPosFromCoreList(selectRailList, wireLength, world, offset);
                                        selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                                        dataMap.setString("selectPosList", selectPosList_JSON, 1);
                                    }
                                }
                                else {
                                    //接続選択
                                    var lastRailCore = selectRailList[selectRailList.length - 1];
                                    var connectRails = getConnectRailCore(lastRailCore, world);
                                    var selectableRails = connectRails.filter(function (core) {
                                        return core !== null && selectRailList.indexOf(core) === -1;//selectRailListに含まれていないRailCoreだけ残す
                                    });
                                    if (selectableRails.indexOf(tileCore) !== -1) {
                                        selectRailList.push(tileCore);
                                        selectRailListData.put(entity, selectRailList);
                                    }

                                    if (isRailSplitMode) {//長さが変わるため
                                        var totalWireLength = calcWireLength(selectRailList, world);
                                        wireLength = totalWireLength / wireCount;
                                        dataMap.setDouble("wireLength", wireLength, 1);
                                    }

                                    //変更を適用
                                    if (selectRailList.length > 0) {
                                        selectPosList = createSelectPosFromCoreList(selectRailList, wireLength, world, offset);
                                        selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                                        dataMap.setString("selectPosList", selectPosList_JSON, 1);
                                    }
                                }
                            }
                        }
                        //レールオブジェクト選択モード
                        else {
                            var rmList = tileCore.getAllRailMaps();//ここを修正した

                            var nearestPos = [Infinity, null];
                            //RailMap[]から一番近いオブジェクト座標を拾ってくる(分岐対応)
                            for (var i = 0; i < rmList.length; i++) {
                                var rm = rmList[i];
                                var split = Math.floor(rm.getLength() * 2);
                                var nearestIndex = rm.getNearlestPoint(split, lookingBlockPos.posX, lookingBlockPos.posZ);
                                var objPosZX = rm.getRailPos(split, nearestIndex);
                                var objPosY = rm.getRailHeight(split, nearestIndex);
                                var toObjVec = new Vec3(objPosZX[1] - lookingBlockPos.posX, objPosY - lookingBlockPos.posY, objPosZX[0] - lookingBlockPos.posZ);
                                if (toObjVec.length() < nearestPos[0]) {
                                    nearestPos = [toObjVec.length(), [objPosZX[1], objPosY, objPosZX[0]]];
                                }
                            }
                            if (nearestPos[1] !== null) {
                                var selBlockX = Math.floor(nearestPos[1][0]);
                                var selBlockY = lookingBlockPos.y;
                                var selBlockZ = Math.floor(nearestPos[1][2]);
                                var selSide = 1;
                                var selOffset = [
                                    nearestPos[1][0] - selBlockX - 0.5,
                                    nearestPos[1][1] - Math.floor(nearestPos[1][1]) - (1 / 16),
                                    nearestPos[1][2] - selBlockZ - 0.5
                                ]
                                //重複チェック
                                var lastPos = selectPosList[selectPosList.length - 1];
                                if (selectPosList.length > 0 && lastPos[0] == selBlockX && lastPos[1] == selBlockY && lastPos[2] == selBlockZ) {
                                    NGTLog.sendChatMessage(player, "This coordinate can't be added");
                                }
                                else {
                                    selectPosList.push([selBlockX, selBlockY, selBlockZ, selSide, selOffset]);
                                    selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                                    dataMap.setString("selectPosList", selectPosList_JSON, 1);
                                }
                            }
                        }
                    }

                    //左クリック ポイント削除
                    if (isLeftClick) {
                        if (selectRailList.length > 0) {
                            selectRailList.pop();
                            selectRailListData.put(entity, selectRailList);
                            if (isRailSplitMode) {//長さが変わるため
                                var totalWireLength = calcWireLength(selectRailList, world);
                                wireLength = totalWireLength / wireCount;
                                dataMap.setDouble("wireLength", wireLength, 1);
                            }
                            //変更を適用
                            if (selectRailList.length > 0) {
                                selectPosList = createSelectPosFromCoreList(selectRailList, wireLength, world, offset);
                                selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                                dataMap.setString("selectPosList", selectPosList_JSON, 1);
                            }
                            else {
                                selectPosList_JSON = "[]";
                                dataMap.setString("selectPosList", selectPosList_JSON, 1);
                            }
                        }
                        else if (selectPosList.length > 0) {
                            selectPosList.pop();
                            selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                            dataMap.setString("selectPosList", selectPosList_JSON, 1);
                        }
                    }
                }

                //マーカー削除
                if (Keyboard.isKeyDown(KeyMaps.allDelete) && !isSelectLock) {
                    selectPosList = [];
                    selectPosList_JSON = "[]";
                    dataMap.setString("selectPosList", selectPosList_JSON, 1);
                    dataMap.setInt("wireCount", 1, 1);
                    selectRailListData.put(entity, []);
                }

                //ヘルプ非表示
                var isKeyDown_isHideHelp = Keyboard.isKeyDown(KeyMaps.isHideHelp);
                var prevInputKey_isHideHelp = dataMap.getBoolean("prevInputKey_isHideHelp");
                if (isKeyDown_isHideHelp && !prevInputKey_isHideHelp) {
                    dataMap.setBoolean("prevInputKey_isHideHelp", true, 0);
                    isHideHelp = !isHideHelp;
                    dataMap.setBoolean("isHideHelp", isHideHelp, 1);
                }
                if (!isKeyDown_isHideHelp && prevInputKey_isHideHelp) {
                    dataMap.setBoolean("prevInputKey_isHideHelp", false, 0);
                }

                //ワイヤー生成
                var isKeyDown_build = Keyboard.isKeyDown(KeyMaps.build);
                var prevInputKey_build = dataMap.getBoolean("prevInputKey_build");
                if (!isKeyDown_build && prevInputKey_build) dataMap.setBoolean("prevInputKey_build", false, 0);
                if (isKeyDown_build && !prevInputKey_build && currentItem && selectPosList.length > 1 && !isSelectLock) {
                    dataMap.setBoolean("prevInputKey_build", true, 0);
                    //手持ちのアイテムがワイヤーアイテムか判別する
                    if (currentItem.func_77973_b() === RTMItem.itemWire) {
                        //モデル名設定
                        var modelName = "NoModel_Side";
                        if (insulatorItem) modelName = getNameForItemStack(insulatorItem);
                        for(var i = 0; i < selectPosList.length; i++){
                            selectPosList[i][6] = modelName;
                        }
                        selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                        dataMap.setString("selectPosList", selectPosList_JSON, 1);
                        //生成処理
                        dataMap.setBoolean("isBuilding", true, 1);
                    }
                }

                //undo
                if (Keyboard.isKeyDown(KeyMaps.optionKey) && Keyboard.isKeyDown(KeyMaps.undo) && !isBuilding && !isUndo && !isSelectLock) {
                    dataMap.setBoolean("isUndo", true, 1);
                }

                //終了
                if (Keyboard.isKeyDown(KeyMaps.endEdit) && !isSelectLock) {
                    dataMap.setBoolean("isEndEdit", true, 1);
                }
            }
            if (isBuilding) {
                if (dataMap.getBoolean("buildComplete")) {//生成完了
                    dataMap.setBoolean("isBuilding", false, 1);
                    dataMap.setBoolean("buildComplete", false, 1);
                }
            }
            if (isUndo) {
                if (dataMap.getBoolean("buildComplete")) {//生成完了
                    dataMap.setBoolean("isUndo", false, 1);
                    dataMap.setBoolean("buildComplete", false, 1);
                }
            }

            //ヘルプ表示
            if (lookingBlockPos) {
                var toPlayerVec = new Vec3(lookingBlockPos.posX - posX, lookingBlockPos.posY - posY, lookingBlockPos.posZ - posZ);
                var lang = NGTUtilClient.getMinecraft().func_135016_M().func_135041_c().func_135034_a().toLowerCase();
                if (langList.indexOf(lang) === -1) lang = langList[0];
                var renderHelp = function (index) {
                    GL11.glPushMatrix();
                    GL11.glTranslatef(lookingBlockPos.posX, lookingBlockPos.posY, lookingBlockPos.posZ);
                    GL11.glTranslatef(-posX, -posY, -posZ);
                    GL11.glRotatef(toPlayerVec.getYaw() + 180, 0, 1, 0);
                    GL11.glRotatef(toPlayerVec.getPitch(), 1, 0, 0);
                    help[lang][index].render(renderer);
                    GL11.glPopMatrix();
                }
                if (isHideHelp) {
                    renderHelp(0);
                }
                else {
                    renderHelp(1);
                }
            }

            //カーソル描画
            if (lookingBlockPos) {
                //ロック表示
                if (isSelectLock) {
                    GL11.glPushMatrix();
                    GL11.glTranslatef(lookingBlockPos.x, lookingBlockPos.y, lookingBlockPos.z);
                    GL11.glTranslatef(-posX, -posY, -posZ);
                    lock.render(renderer);
                    GL11.glPopMatrix();
                }

                var tile = getTileEntity(world, lookingBlockPos.posX, lookingBlockPos.posY, lookingBlockPos.posZ);
                var tileCore = tile instanceof TileEntityLargeRailBase ? tile.getRailCore() : null;
                if (tile && tileCore) {
                    //レール選択モード
                    if ((!isPushOptionKey && selectPosList.length === 0) || selectRailList.length > 0) {
                        if (!(tileCore instanceof TileEntityLargeRailSwitchCore)) {
                            if (selectRailList.length === 0) {
                                //初回選択
                                var selectRailMap = tileCore.getRailMap(null);
                                renderLineFromRailMap(line_railSelect, selectRailMap, posX, posY, posZ);
                            }
                            else {
                                //接続選択
                                var lastRailCore = selectRailList[selectRailList.length - 1];
                                var connectRails = getConnectRailCore(lastRailCore, world);
                                var selectableRails = connectRails.filter(function (core) {
                                    return core !== null && selectRailList.indexOf(core) === -1 && !(core instanceof TileEntityLargeRailSwitchCore);  // selectRailListに含まれていないRailCoreだけ残す
                                });
                                //選択可能な線路
                                for (var i = 0; i < selectableRails.length; i++) {
                                    var selectableRailMap = selectableRails[i].getRailMap(null);
                                    renderLineFromRailMap(line_railSelectable, selectableRailMap, posX, posY, posZ);
                                }
                                //選択している線路
                                if (selectableRails.indexOf(tileCore) !== -1) {
                                    var selectRailMap = tileCore.getRailMap(null);
                                    renderLineFromRailMap(line_railSelect, selectRailMap, posX, posY, posZ);
                                }
                            }
                        }
                    }
                    //レールオブジェクト選択モード
                    else {
                        if (tileCore) {
                            var rmList = tile.getRailCore().getAllRailMaps();
                            var nearestPos = [Infinity, null];
                            //RailMap[]から一番近いオブジェクト座標を拾ってくる(分岐対応)
                            for (var i = 0; i < rmList.length; i++) {
                                var rm = rmList[i];
                                var split = Math.floor(rm.getLength() * 2);
                                var nearestIndex = rm.getNearlestPoint(split, lookingBlockPos.posX, lookingBlockPos.posZ);
                                var objPosZX = rm.getRailPos(split, nearestIndex);
                                var objPosY = rm.getRailHeight(split, nearestIndex);
                                var toObjVec = new Vec3(objPosZX[1] - lookingBlockPos.posX, objPosY - lookingBlockPos.posY, objPosZX[0] - lookingBlockPos.posZ);
                                if (toObjVec.length() < nearestPos[0]) {
                                    nearestPos = [toObjVec.length(), [objPosZX[1], objPosY, objPosZX[0]]];
                                }
                            }
                            if (nearestPos[1] !== null) {
                                //オブジェクト(矢印カーソル)
                                GL11.glPushMatrix();
                                GL11.glTranslatef(nearestPos[1][0], nearestPos[1][1], nearestPos[1][2]);
                                GL11.glTranslatef(-posX, -posY, -posZ);
                                selectObject.render(renderer);
                                GL11.glPopMatrix();

                                //碍子ブロック/碍子
                                var selBlockX = Math.floor(nearestPos[1][0]) + 0.5;
                                var selBlockY = lookingBlockPos.y + 0.5;
                                var selBlockZ = Math.floor(nearestPos[1][2]) + 0.5;
                                GL11.glPushMatrix();
                                GL11.glTranslatef(selBlockX, selBlockY, selBlockZ);
                                GL11.glTranslatef(-posX, -posY, -posZ);
                                cursor.render(renderer);
                                GL11.glPopMatrix();

                                //碍子(ドット)
                                var selOffset = [
                                    nearestPos[1][0] - selBlockX,
                                    nearestPos[1][1] - Math.floor(nearestPos[1][1]) - (1 / 16),
                                    nearestPos[1][2] - selBlockZ
                                ]
                                var selectPosX = selBlockX + selOffset[0];
                                var selectPosY = selBlockY + selOffset[1];
                                var selectPosZ = selBlockZ + selOffset[2];
                                GL11.glPushMatrix();
                                GL11.glTranslatef(0, insulatorOffsetY, 0);
                                GL11.glTranslatef(selectPosX, selectPosY, selectPosZ);
                                GL11.glTranslatef(-posX, -posY, -posZ);
                                selectInsulator.render(renderer);
                                GL11.glPopMatrix();

                                //カーソルライン
                                if (selectPosList.length > 0) {
                                    var lastPos = selectPosList[selectPosList.length - 1];//[selBlockX, selBlockY, selBlockZ, selSide, selOffset]
                                    var lastPos_offset = [
                                        lastPos[0] + 0.5 + lastPos[4][0],
                                        lastPos[1] + 0.5 + lastPos[4][1],
                                        lastPos[2] + 0.5 + lastPos[4][2]
                                    ];
                                    var nextPos = [selectPosX, selectPosY, selectPosZ];
                                    var wireVec = new Vec3(lastPos_offset[0] - nextPos[0], lastPos_offset[1] - nextPos[1], lastPos_offset[2] - nextPos[2]);
                                    var len = wireVec.length();
                                    var distance = Math.round(len).toString();
                                    var playerVec = new Vec3(posX - nextPos[0], posY - nextPos[1], posZ - nextPos[2]);

                                    GL11.glPushMatrix();
                                    GL11.glTranslatef(lastPos_offset[0], lastPos_offset[1], lastPos_offset[2]);
                                    GL11.glTranslatef(0, insulatorOffsetY, 0);
                                    GL11.glTranslatef(-posX, -posY, -posZ);
                                    GL11.glRotatef(wireVec.getYaw() + 90, 0, 1, 0);
                                    GL11.glRotatef(-wireVec.getPitch(), 0, 0, 1);
                                    //ライン
                                    GL11.glPushMatrix();
                                    GL11.glScalef(len, 1, 1);
                                    line_cursor.render(renderer);
                                    GL11.glPopMatrix();
                                    //メモリ
                                    GL11.glTranslatef(len, 0, 0);
                                    distanceMarker.render(renderer);
                                    //距離
                                    GL11.glRotatef(-(wireVec.getYaw() + 90), 0, 1, 0);
                                    GL11.glRotatef(playerVec.getYaw() + 90, 0, 1, 0);
                                    GL11.glRotatef(-playerVec.getPitch(), 0, 0, 1);
                                    for (var i = 0; i < distance.length; i++) {
                                        var num = Number(distance.slice(i, i + 1));
                                        GL11.glPushMatrix();
                                        GL11.glTranslatef(0, 0, i);
                                        distanceDisplay[num].render(renderer);
                                        if (i === (distance.length - 1)) distanceDisplayM.render(renderer);
                                        GL11.glPopMatrix();
                                    }
                                    GL11.glPopMatrix();
                                }
                            }
                        }
                    }
                }
            }

            //選択レール描画
            if (selectRailList.length > 0) {
                if (selectRailList.length === 1) {
                    //RailMap描画
                    var railMap = selectRailList[0].getRailMap(null);
                    renderLineFromRailMap(line_railSelected, railMap, posX, posY, posZ);
                }
                else {
                    //ベジェ曲線描画
                    var renderBezierList = createBezierList(selectRailList, world);
                    renderBezierList.forEach(function (bezierCurve3d) {
                        var split = Math.floor(bezierCurve3d.getLength() * 2);
                        for (var index = 0; index <= split; index++) {
                            var pos = bezierCurve3d.getPoint(index, split);
                            var bezierYaw = bezierCurve3d.getYaw(index, split);
                            var bezierPitch = bezierCurve3d.getPitch(index, split);
                            if (index === split) {
                                bezierYaw = bezierCurve3d.getYaw(index - 1, split);
                                bezierPitch = bezierCurve3d.getPitch(index - 1, split);
                            }
                            GL11.glPushMatrix();
                            GL11.glTranslatef(pos[0], pos[1], pos[2]);
                            GL11.glTranslatef(-posX, -posY, -posZ);
                            GL11.glRotatef(-bezierYaw, 0, 1, 0);
                            GL11.glRotatef(bezierPitch, 0, 0, 1);
                            line_railSelected.render(renderer);
                            if (index % 5 === 0) lineArrow.render(renderer);
                            GL11.glPopMatrix();
                        }
                    });
                }
            }

            //指定ポイント・線描画
            if (selectPosList.length > 0) {
                //始点→終点の線と点
                for (var i = 0; i < selectPosList.length - 1; i++) {
                    var lastPos = selectPosList[i];
                    var offsetPos = lastPos[4];
                    var lastPos_offset = [
                        lastPos[0] + 0.5 + offsetPos[0],
                        lastPos[1] + 0.5 + offsetPos[1],
                        lastPos[2] + 0.5 + offsetPos[2]
                    ];
                    var nextPos = selectPosList[i + 1];
                    var nextPos_offset = [
                        nextPos[0] + 0.5 + nextPos[4][0],
                        nextPos[1] + 0.5 + nextPos[4][1],
                        nextPos[2] + 0.5 + nextPos[4][2]
                    ];
                    var wireVec = new Vec3(lastPos_offset[0] - nextPos_offset[0], lastPos_offset[1] - nextPos_offset[1], lastPos_offset[2] - nextPos_offset[2]);
                    GL11.glPushMatrix();
                    GL11.glTranslatef(lastPos_offset[0], lastPos_offset[1], lastPos_offset[2]);
                    GL11.glTranslatef(-posX, -posY, -posZ);
                    //ポイント(ブロック)
                    GL11.glPushMatrix();
                    GL11.glTranslatef(-offsetPos[0], -offsetPos[1], -offsetPos[2]);
                    point.render(renderer);
                    GL11.glPopMatrix();
                    //ポイント(碍子)
                    GL11.glTranslatef(0, insulatorOffsetY, 0);
                    selectedInsulator.render(renderer);
                    //ライン
                    GL11.glRotatef(wireVec.getYaw() + 90, 0, 1, 0);
                    GL11.glRotatef(-wireVec.getPitch(), 0, 0, 1);
                    GL11.glScalef(wireVec.length(), 1, 1)
                    line.render(renderer);
                    GL11.glPopMatrix();
                }
                //終点の点
                var lastPos = selectPosList[selectPosList.length - 1];
                var offsetPos = lastPos[4];
                var lastPos_offset = [
                    lastPos[0] + 0.5 + offsetPos[0],
                    lastPos[1] + 0.5 + offsetPos[1],
                    lastPos[2] + 0.5 + offsetPos[2]
                ];
                GL11.glPushMatrix();
                GL11.glTranslatef(lastPos_offset[0], lastPos_offset[1], lastPos_offset[2]);
                GL11.glTranslatef(-posX, -posY, -posZ);
                //ポイント(ブロック)
                GL11.glPushMatrix();
                GL11.glTranslatef(-offsetPos[0], -offsetPos[1], -offsetPos[2]);
                point.render(renderer);
                GL11.glPopMatrix();
                GL11.glTranslatef(0, insulatorOffsetY, 0);
                //ポイント(碍子)
                selectedInsulator.render(renderer);
                GL11.glPopMatrix();
            }
        }
    }
}

//####  関数  ####
//# クライアントサイド #
function getLookingPos(world, heightOffset, isPushOption) {
    var pos = null;
    var player = MCWrapperClient.getPlayer();
    var mop = BlockUtil.getMOPFromPlayer(player, cursorMaxDistance, true);
    if (mop) {
        var lookingVec = mop.field_72307_f;//hitVec
        if (isOldVer) {
            var x = mop.field_72311_b;//blockX
            var y = mop.field_72312_c;//blockY
            var z = mop.field_72309_d;//blockZ
            var side = mop.field_72310_e;//Int
            var modelOffset = [0, 0, 0];
            //選択面から垂直方向のオフセットを追加
            switch (side) {
                case 0: y = y - heightOffset; break; // 下
                case 1: y = y + heightOffset; break; // 上
                case 2: z = z - heightOffset; break; // 北
                case 3: z = z + heightOffset; break; // 南
                case 4: x = x - heightOffset; break; // 西
                case 5: x = x + heightOffset; break; // 東
            }
            if (isPushOption && isKaizPatch) {
                modelOffset = [
                    lookingVec.field_72450_a - (x + 0.5),
                    lookingVec.field_72448_b - (y + 0.5),
                    lookingVec.field_72449_c - (z + 0.5)
                ];
            }
            pos = {
                x: x,
                y: y,
                z: z,
                side: side,
                offset: modelOffset,
                posX: lookingVec.field_72450_a,
                posY: lookingVec.field_72448_b,
                posZ: lookingVec.field_72449_c
            };
        }
        else {
            var blockPos = mop.func_178782_a();
            var side = mop.field_178784_b;//EnumFacing
            var offsetBlockPos = blockPos.func_177967_a(side, heightOffset);//選択面から垂直方向のオフセットを追加
            var x = offsetBlockPos.func_177958_n();//blockX
            var y = offsetBlockPos.func_177956_o();//blockY
            var z = offsetBlockPos.func_177952_p();//blockZ
            var modelOffset = [0, 0, 0];
            if (isPushOption && isFixRTM) {
                modelOffset = [
                    lookingVec.field_72450_a - (x + 0.5),
                    lookingVec.field_72448_b - (y + 0.5),
                    lookingVec.field_72449_c - (z + 0.5)
                ];
            }
            pos = {
                x: x,
                y: y,
                z: z,
                side: side.func_176745_a(),
                offset: modelOffset,
                posX: lookingVec.field_72450_a,
                posY: lookingVec.field_72448_b,
                posZ: lookingVec.field_72449_c
            };
        }
    }
    return pos;
}

//指定座標の周囲にあるtileEntityを取得する
function getAroundTileEntity(world, x, y, z, range) {
    var tileEntityList = [];
    var offset = Math.floor(range / 2);
    for (var xIdx = 0; xIdx < range; xIdx++) {
        for (var zIdx = 0; zIdx < range; zIdx++) {
            for (var yIdx = 0; yIdx < range; yIdx++) {
                var posX = x + xIdx - offset;
                var posY = y + yIdx - offset;
                var posZ = z + zIdx - offset;
                var tile = getTileEntity(world, posX, posY, posZ);
                if (tile) tileEntityList.push(tile);
            }
        }
    }
    return tileEntityList;
}

function getTileEntityPos(tileEntity) {
    if (isOldVer) {
        return {
            x: tileEntity.field_145851_c,
            y: tileEntity.field_145848_d,
            z: tileEntity.field_145849_e
        }
    }
    else {
        var blockPos = tileEntity.func_174877_v();
        return {
            x: blockPos.func_177958_n(),
            y: blockPos.func_177956_o(),
            z: blockPos.func_177952_p()
        }
    }
}

function getInsulatorY(itemStack) {
    var item = itemStack.func_77973_b();
    var posY = null;
    if (item instanceof ItemInstalledObject) {
        var itemName = getNameForItemStack(itemStack);
        var modelSet = isOldVer ? ModelPackManager.INSTANCE.getModelSet("ModelConnector", itemName) : ModelPackManager.INSTANCE.getResourceSet(RTMResource.CONNECTOR_RELAY, itemName);
        if (modelSet) {
            var cfg = modelSet.getConfig();
            posY = cfg.wirePos[1];
        }
    }
    return posY;
}

function renderLineFromRailMap(part, railMap, entityX, entityY, entityZ) {
    var split = Math.floor(railMap.getLength() * 2);
    for (var i = 0; i <= split; i++) {
        var pos = railMap.getRailPos(split, i);
        var height = railMap.getRailHeight(split, i);
        var yaw = railMap.getRailRotation(split, i);
        var pitch = isKaizPatch || !isOldVer ? railMap.getRailPitch(split, i) : railMap.getRailPitch();
        GL11.glPushMatrix();
        GL11.glTranslatef(pos[1], height, pos[0]);
        GL11.glTranslatef(-entityX, -entityY, -entityZ);
        GL11.glRotatef(yaw + 90, 0, 1, 0);
        GL11.glRotatef(-pitch, 1, 0, 0);
        part.render(renderer);
        GL11.glPopMatrix();
    }
}

//# 共通 #
function getSelectedSlotItem(player) {
    var inventory = player.field_71071_by;
    var index = inventory.field_70461_c;
    if (isOldVer) return inventory.field_70462_a[index];
    else return inventory.field_70462_a.get(index);
}

function getTileEntity(world, x, y, z) {
    if (isOldVer) return world.func_147438_o(x, y, z);
    else {
        var blockPos = new Packages.net.minecraft.util.math.BlockPos(Math.floor(x), Math.floor(y), Math.floor(z));
        return world.func_175625_s(blockPos);
    }
}

function doFollowing(entity, hostPlayer) {
    if (!entity || !hostPlayer || isOldVer) return;
    var x = hostPlayer.field_70165_t;
    var y = hostPlayer.field_70163_u + 2;
    var z = hostPlayer.field_70161_v;

    entity.func_70107_b(x, y, z);

    entity.field_70159_w = 0;
    entity.field_70181_x = 0;
    entity.field_70179_y = 0;
}

function getItemInsulator(player) {
    if (isOldVer) {
        for (var i = 0; i <= 8; i++) {
            var inventory = player.field_71071_by;
            var item = inventory.field_70462_a[i];
            if (item && item.func_77973_b() instanceof ItemInstalledObject && getItemType(item) === "Relay") {
                return item;
            }
        }
        return null;
    }
    else {
        for (var i = 0; i <= 8; i++) {
            var inventory = player.field_71071_by;
            var item = inventory.field_70462_a.get(i);
            if (item && item.func_77973_b() instanceof ItemInstalledObject && getItemType(item) === "Relay") {
                return item;
            }
        }
        return null;
    }
}

function getItemType(itemStack) {
    if (isOldVer) {
        return itemStack.func_77973_b().getSubType(itemStack);
    }
    else {
        return itemStack.func_77973_b().getModelState(itemStack).type.subType;
    }
}

function getNameForItemStack(itemStack) {
    if (isOldVer) {
        return itemStack.func_77973_b().getModelName(itemStack);
    }
    else {
        var resourceState = itemStack.func_77973_b().getModelState(itemStack);
        return resourceState.getResourceName();
    }
}

//指定のレールに接続するレールのRailCoreを取得する
function getConnectRailCore(baseRailCore, world) {
    var getConnectCore = function (rp) {
        var rpConnectPos = getConnectPos(rp);
        if (!rpConnectPos) return null;
        var rpConnectTile = getTileEntity(world, rpConnectPos.x, rpConnectPos.y, rpConnectPos.z);
        if (rpConnectTile instanceof TileEntityLargeRailBase) return rpConnectTile.getRailCore();
        return null;
    };
    var railMaps = baseRailCore.getAllRailMaps();
    var connectRailCoreList = [];
    if (railMaps.length === 1) {
        //普通レール
        var rps = baseRailCore.getRailPositions();
        connectRailCoreList.push(getConnectCore(rps[0]));
        connectRailCoreList.push(getConnectCore(rps[1]));
    }
    else {
        //分岐レール
        var points = baseRailCore.getSwitch().getPoints();
        for (var i = 0; i < points.length; i++) {
            connectRailCoreList.push(getConnectCore(points[i].rpRoot));
        }
    }
    return connectRailCoreList;
}

function getConnectPos(railPos) {
    if (!railPos || railPos.direction === null || railPos.direction === undefined) return null;
    return {
        x: Math.floor(railPos.blockX + 0.5 + RailPosition.REVISION[Number(railPos.direction)][0] * 2),
        y: railPos.blockY,
        z: Math.floor(railPos.blockZ + 0.5 + RailPosition.REVISION[Number(railPos.direction)][1] * 2)
    }
}

function getBezierFromRailMap(railMap, isFlip) {
    var startRP = railMap.getStartRP();
    var endRP = railMap.getEndRP();
    if (isFlip) {
        var startRP = railMap.getEndRP();
        var endRP = railMap.getStartRP();
    }
    var straightPitch = (new Vec3(endRP.posX - startRP.posX, endRP.posY - startRP.posY, endRP.posZ - startRP.posZ)).getPitch();
    //ピッチ
    var startAnchorPitch = (isKaizPatch || !isOldVer) ? startRP.anchorPitch : straightPitch;
    var endAnchorPitch = (isKaizPatch || !isOldVer) ? endRP.anchorPitch : straightPitch;
    if (startAnchorPitch === 0 && endAnchorPitch === 0 && (startRP.posY !== endRP.posY) && (isKaizPatch || !isOldVer)) {
        //縦曲線未設定による代替処理
        var split = Math.floor(railMap.getLength() * 2);
        startAnchorPitch = railMap.getRailPitch(split, 0);
        endAnchorPitch = -startAnchorPitch
    }
    //始点
    var startAnchorYaw = (isKaizPatch || !isOldVer) ? startRP.anchorYaw : startRP.anchorDirection;
    var startAnchorLength = (isKaizPatch || !isOldVer) ? startRP.anchorLengthHorizontal : startRP.anchorLength;
    var startAnchorVec = (new Vec3(0, 0, startAnchorLength)).rotateAroundX(startAnchorPitch).rotateAroundY(startAnchorYaw);
    //終点
    var endAnchorYaw = (isKaizPatch || !isOldVer) ? endRP.anchorYaw : endRP.anchorDirection;
    var endAnchorLength = (isKaizPatch || !isOldVer) ? endRP.anchorLengthHorizontal : endRP.anchorLength;
    var endAnchorVec = (new Vec3(0, 0, endAnchorLength)).rotateAroundX(endAnchorPitch).rotateAroundY(endAnchorYaw);
    //座標
    var startPos = [startRP.posX, startRP.posY, startRP.posZ];
    var endPos = [endRP.posX, endRP.posY, endRP.posZ];
    var startAnchorPos = [startRP.posX + startAnchorVec.getX(), startRP.posY + startAnchorVec.getY(), startRP.posZ + startAnchorVec.getZ()];
    var endAnchorPos = [endRP.posX + endAnchorVec.getX(), endRP.posY + endAnchorVec.getY(), endRP.posZ + endAnchorVec.getZ()];
    return new BezierCurve3D(startPos, startAnchorPos, endAnchorPos, endPos);
}

function createBezierList(railCoreList, world) {
    if (railCoreList.length === 0) return [];

    var bezierList = [];
    if (railCoreList.length === 1) {//1本だけ
        var rm = railCoreList[0].getRailMap(null);
        bezierList.push(getBezierFromRailMap(rm, false));
    }
    else {//2本以上(向きを設定するため)
        //最後以外のレールは次のレールを比較して向きを決める
        for (var i = 0; i < railCoreList.length - 1; i++) {
            var currentCore = railCoreList[i];
            var currentRailMap = currentCore.getRailMap(null);
            var nextCore = railCoreList[i + 1];
            var connectRailCore = getConnectRailCore(currentCore, world);
            if (connectRailCore[0] === nextCore) {//startRP側に次のレールがある→逆順
                bezierList.push(getBezierFromRailMap(currentRailMap, true));
            }
            if (connectRailCore[1] === nextCore) {//endRP側に次のレールがある→正順
                bezierList.push(getBezierFromRailMap(currentRailMap, false));
            }
        }
        //最後のレールは前のレールと比較して向きを決める
        var currentCore = railCoreList[railCoreList.length - 1];
        var currentRailMap = currentCore.getRailMap(null);
        var prevCore = railCoreList[railCoreList.length - 2];
        var connectRailCore = getConnectRailCore(currentCore, world);
        if (connectRailCore[0] === prevCore) {//startRP側に前のレールがある→正順
            bezierList.push(getBezierFromRailMap(currentRailMap, false));
        }
        if (connectRailCore[1] === prevCore) {//endRP側に前のレールがある→逆順
            bezierList.push(getBezierFromRailMap(currentRailMap, true));
        }
    }
    return bezierList;
}

function calcWireLength(railCoreList, world) {
    var bezierList = createBezierList(railCoreList, world);
    if (bezierList.length === 0) return null;
    var totalLength = 0;
    for (var i = 0; i < bezierList.length; i++) {
        var bezierLength = bezierList[i].getLength();
        totalLength = totalLength + bezierLength;
    }
    return totalLength;
}

function createSelectPosFromCoreList(railCoreList, wireLength, world, offsetY) {
    if (wireLength <= 0) return [];
    var bezierList = createBezierList(railCoreList, world);

    //全長と各ベジェ曲線の長さを計算
    var bezierLengths = [];
    var totalLength = 0;
    for (var i = 0; i < bezierList.length; i++) {
        var bezier = bezierList[i];
        var length = bezier.getLength();
        bezierLengths.push(length);
        totalLength += length;
    }

    //始点から各碍子の位置の長さを出す
    var targetLengths = [];
    var currentLength = 0;
    while (currentLength <= totalLength) {
        targetLengths.push(currentLength);
        currentLength += wireLength;
    }

    //碍子の位置を持つベジェ曲線を調べる
    var posList = [];
    for (var i = 0; i < targetLengths.length; i++) {
        var targetLength = targetLengths[i];
        var accumulatedLength = 0;
        //ベジェ曲線を順に調べて、その碍子を保有するベジェ曲線を特定
        for (var bezierIdx = 0; bezierIdx < bezierList.length; bezierIdx++) {
            var bezierLength = bezierLengths[bezierIdx];
            //(始点からの碍子の位置の長さ <= 始点からそのベジェ曲端までの長さ) ならそのベジェ曲線に碍子がある
            if (targetLength <= accumulatedLength + bezierLength) {
                var bezier = bezierList[bezierIdx];
                var lengthWithinBezier = targetLength - accumulatedLength;//ベジェ曲線の始点から碍子の位置までの長さ
                var t = lengthWithinBezier / bezierLength;
                var split = Math.floor(bezier.getLength() * 2);
                var index = Math.floor(t * split);
                if (index === 0) index += 1;
                if (index === split) index -= 1;
                var point = bezier.getPoint(index, split);
                //データ変換
                var posX = Math.floor(point[0]);
                var posY = Math.floor(point[1]);
                var posZ = Math.floor(point[2]);
                var offset = [
                    point[0] - posX - 0.5,
                    point[1] - posY - (1 / 16),
                    point[2] - posZ - 0.5,
                ]
                posList.push([posX, posY + offsetY, posZ, 1, offset]);
                break;
            }
            accumulatedLength += bezierLength;
        }
    }

    //始点終点の周囲に碍子があれば接続するように作る
    if (posList[0]) {
        var posS = posList[0];
        var posSTileData = getAroundInsulatorPosData(world, posS[0], posS[1], posS[2]);
        if (posSTileData) posList[0] = posSTileData;
    }
    if (posList[posList.length - 1]) {
        var posE = posList[posList.length - 1];
        var posETileData = getAroundInsulatorPosData(world, posE[0], posE[1], posE[2]);
        if (posETileData) posList[posList.length - 1] = posETileData;
    }

    return posList;
}

function getAroundInsulatorPosData(world, x, y, z) {
    var tileEntityList = getAroundTileEntity(world, x, y, z, 3.5);
    var insulator = null;
    for (var i = 0; i < tileEntityList.length; i++) {
        var tile = tileEntityList[i];
        if (tile instanceof TileEntityInsulator) {
            insulator = tile;
            break;
        }
    }
    if (!insulator) return null;
    var pos = getTileEntityPos(insulator);
    var offset = [0, 0, 0];
    if (isKaizPatch || !isOldVer) {
        var wirePos = insulator.getWirePos();
        offset = [
            wirePos.getX(),
            0,
            wirePos.getZ()
        ]
    }
    return [pos.x, pos.y, pos.z, 1, offset];
}

//###  3次元ベジェ曲線擬似クラス  ###
function BezierCurve3D(arg1, arg2, arg3, arg4) {
    var lerpPoint = function (pos1, pos2, ratio) {
        return [
            pos1[0] + (pos2[0] - pos1[0]) * ratio,
            pos1[1] + (pos2[1] - pos1[1]) * ratio,
            pos1[2] + (pos2[2] - pos1[2]) * ratio
        ];
    }
    if (arg4 === undefined) {
        var startPos = arg1;
        var handlePos = arg2;
        var endPos = arg3;
        this.p0 = startPos;
        this.p1 = lerpPoint(startPos, handlePos, 2 / 3);
        this.p2 = lerpPoint(endPos, handlePos, 2 / 3);
        this.p3 = endPos;
    }
    else {
        this.p0 = arg1;
        this.p1 = arg2;
        this.p2 = arg3;
        this.p3 = arg4;
    }
}

BezierCurve3D.prototype = {
    getPoint: function (index, split) {
        index = Math.min(Math.max(index, 0), split);
        var t = index / split;
        var u = 1 - t;
        var point = [
            u * u * u * this.p0[0] + 3 * u * u * t * this.p1[0] + 3 * u * t * t * this.p2[0] + t * t * t * this.p3[0],
            u * u * u * this.p0[1] + 3 * u * u * t * this.p1[1] + 3 * u * t * t * this.p2[1] + t * t * t * this.p3[1],
            u * u * u * this.p0[2] + 3 * u * u * t * this.p1[2] + 3 * u * t * t * this.p2[2] + t * t * t * this.p3[2]
        ];
        return point;
    },
    getYaw: function (index, split) {
        index = Math.min(Math.max(index, 0), split);
        var point1 = this.getPoint(index, split);
        var point2 = this.getPoint(index + 1, split);
        var dx = point2[0] - point1[0];
        var dz = point2[2] - point1[2];
        var yaw = Math.atan2(dz, dx);
        return yaw * (180 / Math.PI);
    },
    getPitch: function (index, split) {
        index = Math.min(Math.max(index, 0), split);
        var point1 = this.getPoint(index, split);
        var point2 = this.getPoint(index + 1, split);
        var dy = point2[1] - point1[1];
        var dx = point2[0] - point1[0];
        var dz = point2[2] - point1[2];
        var distance = Math.sqrt(dx * dx + dz * dz);
        var pitch = Math.atan2(dy, distance);
        return pitch * (180 / Math.PI);
    },
    getLength: function () {
        var dx = this.p3[0] - this.p0[0];
        var dy = this.p3[1] - this.p0[1];
        var dz = this.p3[2] - this.p0[2];
        //始点～終点直線距離の2倍を分割精度とする
        var distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var split = Math.ceil(distance * 2);
        var length = 0;
        var previousPoint = this.getPoint(0, split);
        for (var i = 1; i <= split; i++) {
            var currentPoint = this.getPoint(i, split);
            dx = currentPoint[0] - previousPoint[0];
            dy = currentPoint[1] - previousPoint[1];
            dz = currentPoint[2] - previousPoint[2];
            var segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
            length += segmentLength;
            previousPoint = currentPoint;
        }
        return length;
    },
    getStartAnchorLength: function () {
        var dx = this.p1[0] - this.p0[0];
        var dy = this.p1[1] - this.p0[1];
        var dz = this.p1[2] - this.p0[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },
    getEndAnchorLength: function () {
        var dx = this.p3[0] - this.p2[0];
        var dy = this.p3[1] - this.p2[1];
        var dz = this.p3[2] - this.p2[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
};