var NGTOBuilderVersion = "1.12";

var renderClass = "jp.ngt.rtm.render.VehiclePartsRenderer";
importPackage(Packages.org.lwjgl.opengl);
importPackage(Packages.org.lwjgl.input);
importPackage(Packages.jp.ngt.rtm.render);

//MCTE
importPackage(Packages.jp.ngt.mcte);//MCTE
importPackage(Packages.jp.ngt.mcte.item);//ItemMiniature

//NGTLib
importPackage(Packages.jp.ngt.ngtlib.io);//NGTLog
importPackage(Packages.jp.ngt.ngtlib.math);//Vec3
importPackage(Packages.jp.ngt.ngtlib.util);//NGTUtilClient MCWrapper
importPackage(Packages.jp.ngt.ngtlib.block);//BlockUtil

//RealTrainMod
importPackage(Packages.jp.ngt.rtm);//RTMCore
importPackage(Packages.jp.ngt.rtm.rail);//TileEntityLargeRailBase

//Minecraft
importPackage(Packages.net.minecraft.item);//ItemBlock
importPackage(Packages.net.minecraft.block);//Block
importPackage(Packages.net.minecraft.init);//Blocks


var isOldVer = RTMCore.VERSION.indexOf("1.7.10") >= 0;
var isKaizPatch = RTMCore.VERSION.indexOf("KaizPatch") !== -1;
var ignoreItemList = [MCTE.itemMiniature];

var bezierCurveMap = new java.util.HashMap();
var renderBlockDataCache = new java.util.HashMap();
var lastNGTO = new java.util.HashMap();
var loadedNGTOList = new java.util.HashMap();
var selectedRailMapData = new java.util.HashMap();
var selectPosListData = new java.util.HashMap();

//#################
//##  Settings  ###
//#################
var cursorMaxDistance = 512;//カーソルの限界距離
//キー設定
var KeyMaps = {
    //オプションキー
    optionKey: Keyboard.KEY_LCONTROL,

    //Y座標オフセット変更/NGTO高さ変更(+オプション)
    offsetYUp: Keyboard.KEY_UP,
    offsetYDown: Keyboard.KEY_DOWN,

    //Y座標オフセットをリセット/Y座標オフセットをスナップ(+オプション)
    resetOffsetY: Keyboard.KEY_F,

    //道路を生成する
    build: Keyboard.KEY_RETURN,

    //マーカー全削除
    allDelete: Keyboard.KEY_C,

    //繰り返しON/OFF
    isNoRepeat: Keyboard.KEY_O,

    //マーカーの順序を反転する
    reverseMarker: Keyboard.KEY_P,

    //空気ブロックの設置のON/OFF
    isPlaceAirBlock: Keyboard.KEY_I,

    //マスク機能のON/OFF
    isMasking: Keyboard.KEY_U,

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
    block = renderer.registerParts(new Parts("block"));
    cursor = renderer.registerParts(new Parts("cursor"));
    lineArrow = renderer.registerParts(new Parts("lineArrow"));
    anchorLine = renderer.registerParts(new Parts("anchorLine"));
    point_mask = renderer.registerParts(new Parts("point_mask"));
    block_mask = renderer.registerParts(new Parts("block_mask"));
    anchorSplit = renderer.registerParts(new Parts("anchorSplit"));
    cursor_mask = renderer.registerParts(new Parts("cursor_mask"));
    offsetYLine = renderer.registerParts(new Parts("offsetYLine"));
    railSelectLine = renderer.registerParts(new Parts("railSelectLine"));
    offsetYLine_ground = renderer.registerParts(new Parts("offsetYLine_ground"));

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
    var lookingBlockPos = getLookingPos();
    var hostPlayerEntityId = dataMap.getString("hostPlayerEntityId");
    var hostPlayer = null;
    if (hostPlayerEntityId !== "") hostPlayer = world.func_73045_a(hostPlayerEntityId);
    var offsetY = dataMap.getInt("offsetY");
    var offsetY_ngto = dataMap.getInt("offsetY_ngto");
    var isNoRepeat = dataMap.getBoolean("isNoRepeat");
    var isPlaceAirBlock = dataMap.getBoolean("isPlaceAirBlock");
    var isMasking = dataMap.getBoolean("isMasking");
    var isHideHelp = dataMap.getBoolean("isHideHelp");
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

    doFollowing(entity, hostPlayer);//1.12用

    if (hostPlayer) {
        //データ持ち越し
        var selectPosList = selectPosListData.get(entity) || [];
        var selectedRailMaps = selectedRailMapData.get(entity) || [];//リスト型
        var bezierCurveList = bezierCurveMap.get(entity);
        if (selectPosList.length !== 0) {
            bezierCurveList = createBezierCurveList(selectPosList);
            bezierCurveMap.put(entity, bezierCurveList);
        }
        else if (selectedRailMaps.length !== 0) {
            bezierCurveList = getBezierFromRailMaps(selectedRailMaps);
            bezierCurveMap.put(entity, bezierCurveList);
        }
        else {
            bezierCurveList = null;
            bezierCurveMap.put(entity, bezierCurveList);
        }

        //操作プレイヤー
        if (hostPlayer === player) {
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
            var reculcRenderBlock = false;
            var prevIsClick = dataMap.getBoolean("prevIsClick");
            if (!prevIsClick && (isLeftClick || isRightClick)) dataMap.setBoolean("prevIsClick", true, 0);
            if (prevIsClick && !isLeftClick && !isRightClick) dataMap.setBoolean("prevIsClick", false, 0);
            if (currentItem) {
                var nbt = currentItem.func_77978_p();
                if (!(nbt && nbt.func_74764_b("BlocksData"))) {
                    lastNGTO.put(entity, null);
                }
            }

            if (!isOpenGUI && !isBuilding && !isUndo) {
                //キー入力
                var prevInputOffsetKey = dataMap.getBoolean("prevInputOffsetKey");
                var isKeyDown_up = Keyboard.isKeyDown(KeyMaps.offsetYUp);
                var isKeyDown_down = Keyboard.isKeyDown(KeyMaps.offsetYDown);
                var isKeyDown_reset = Keyboard.isKeyDown(KeyMaps.resetOffsetY);
                if (!Keyboard.isKeyDown(KeyMaps.optionKey)) {
                    //↑キー
                    if (isKeyDown_up) {
                        dataMap.setBoolean("prevInputOffsetKey", true, 0);
                        if (!prevInputOffsetKey) {
                            offsetY += 1;
                            dataMap.setInt("offsetY", offsetY, 1);
                        }
                    }

                    //↓キー
                    if (isKeyDown_down) {
                        dataMap.setBoolean("prevInputOffsetKey", true, 0);
                        if (!prevInputOffsetKey) {
                            offsetY -= 1;
                            dataMap.setInt("offsetY", offsetY, 1);
                        }
                    }

                    //Fキー
                    if (isKeyDown_reset) {
                        dataMap.setInt("offsetY", 0, 1);
                    }
                }
                else {
                    //CTRL + ↑キー
                    if (isKeyDown_up) {
                        dataMap.setBoolean("prevInputOffsetKey", true, 0);
                        if (!prevInputOffsetKey) {
                            offsetY_ngto += 1;
                            dataMap.setInt("offsetY_ngto", offsetY_ngto, 1);
                        }
                    }

                    //CTRL + ↓キー
                    if (isKeyDown_down) {
                        dataMap.setBoolean("prevInputOffsetKey", true, 0);
                        if (!prevInputOffsetKey) {
                            offsetY_ngto -= 1;
                            dataMap.setInt("offsetY_ngto", offsetY_ngto, 1);
                        }
                    }

                    //CTRL + Fキー
                    if (isKeyDown_reset && selectPosList.length > 0 && lookingBlockPos) {
                        var lastPosY = selectPosList[selectPosList.length - 1][1];
                        var currentPosY = lookingBlockPos.y;
                        dataMap.setInt("offsetY", lastPosY - currentPosY, 1);
                    }
                }

                if (!isKeyDown_up && !isKeyDown_down && prevInputOffsetKey) {
                    dataMap.setBoolean("prevInputOffsetKey", false, 0);
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

                //リピートON/OFF
                var isKeyDown_isNoRepeat = Keyboard.isKeyDown(KeyMaps.isNoRepeat);
                var prevInputKey_isNoRepeat = dataMap.getBoolean("prevInputKey_isNoRepeat");
                if (isKeyDown_isNoRepeat && !prevInputKey_isNoRepeat) {
                    dataMap.setBoolean("prevInputKey_isNoRepeat", true, 0);
                    isNoRepeat = !isNoRepeat;
                    dataMap.setBoolean("isNoRepeat", isNoRepeat, 1);
                    NGTLog.sendChatMessage(player, "isNoRepeat:" + isNoRepeat);
                    reculcRenderBlock = true;
                }
                if (!isKeyDown_isNoRepeat && prevInputKey_isNoRepeat) {
                    dataMap.setBoolean("prevInputKey_isNoRepeat", false, 0);
                }

                //空気設置ON/OFF
                var isKeyDown_isPlaceAirBlock = Keyboard.isKeyDown(KeyMaps.isPlaceAirBlock);
                var prevInputKey_isPlaceAirBlock = dataMap.getBoolean("prevInputKey_isPlaceAirBlock");
                if (isKeyDown_isPlaceAirBlock && !prevInputKey_isPlaceAirBlock) {
                    dataMap.setBoolean("prevInputKey_isPlaceAirBlock", true, 0);
                    isPlaceAirBlock = !isPlaceAirBlock;
                    dataMap.setBoolean("isPlaceAirBlock", isPlaceAirBlock, 1);
                    NGTLog.sendChatMessage(player, "isPlaceAirBlock:" + isPlaceAirBlock);
                    reculcRenderBlock = true;
                }
                if (!isKeyDown_isPlaceAirBlock && prevInputKey_isPlaceAirBlock) {
                    dataMap.setBoolean("prevInputKey_isPlaceAirBlock", false, 0);
                }

                //マスクON/OFF
                var isKeyDown_isMasking = Keyboard.isKeyDown(KeyMaps.isMasking);
                var prevInputKey_isMasking = dataMap.getBoolean("prevInputKey_isMasking");
                if (isKeyDown_isMasking && !prevInputKey_isMasking) {
                    dataMap.setBoolean("prevInputKey_isMasking", true, 0);
                    isMasking = !isMasking;
                    dataMap.setBoolean("isMasking", isMasking, 1);
                    NGTLog.sendChatMessage(player, "isMasking:" + isMasking);
                    reculcRenderBlock = true;
                }
                if (!isKeyDown_isMasking && prevInputKey_isMasking) {
                    dataMap.setBoolean("prevInputKey_isMasking", false, 0);
                }

                //マーカー順序反転
                if (selectPosList.length > 0) {
                    var isKeyDown_reverseMarker = Keyboard.isKeyDown(KeyMaps.reverseMarker);
                    var prevInputKey_reverseMarker = dataMap.getBoolean("prevInputKey_reverseMarker");
                    if (isKeyDown_reverseMarker && !prevInputKey_reverseMarker) {
                        dataMap.setBoolean("prevInputKey_reverseMarker", true, 0);
                        selectPosList.reverse();
                        selectPosListData.put(entity, selectPosList);
                        bezierCurveList = createBezierCurveList(selectPosList);
                        bezierCurveMap.put(entity, bezierCurveList);
                        reculcRenderBlock = true;
                    }
                    if (!isKeyDown_reverseMarker && prevInputKey_reverseMarker) {
                        dataMap.setBoolean("prevInputKey_reverseMarker", false, 0);
                    }
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

                //座標指定
                if (lookingBlockPos && !prevIsClick && !isSelectLock) {
                    //右クリック ポイント追加
                    if (isRightClick) {
                        var lastPos = selectPosList[selectPosList.length - 1];
                        var selPosX = lookingBlockPos.x;
                        var selPosY = lookingBlockPos.y + offsetY;
                        var selPosZ = lookingBlockPos.z;
                        var railTile = getRailTile(world, selPosX, selPosY, selPosZ);
                        if (railTile && selectPosList.length === 0) {
                            //レール選択
                            var railMaps = railTile.getRailCore().getAllRailMaps();
                            for (var i = 0; i < railMaps.length; i++) {
                                if (selectedRailMaps.indexOf(railMaps[i]) === -1) selectedRailMaps.push(railMaps[i]);
                            }
                            selectedRailMapData.put(entity, selectedRailMaps);
                            reculcRenderBlock = true;
                        }
                        else {
                            //通常選択
                            if (selectPosList.length > 0 && lastPos[0] == selPosX && lastPos[1] == selPosY && lastPos[2] == selPosZ) {
                                NGTLog.sendChatMessage(player, "This coordinate can't be added");
                            }
                            else {
                                selectPosList.push([selPosX, selPosY, selPosZ]);
                                selectPosListData.put(entity, selectPosList);
                                reculcRenderBlock = true;
                            }
                        }
                    }
                    //左クリック ポイント削除
                    if (isLeftClick) {
                        if (selectPosList.length > 0) {
                            selectPosList.pop();
                            selectPosListData.put(entity, selectPosList);
                            reculcRenderBlock = true;
                        }
                        else if (selectedRailMaps) {
                            selectedRailMaps.pop();
                            selectedRailMapData.put(entity, selectedRailMaps);
                            reculcRenderBlock = true;
                        }
                    }
                }

                //選択を削除
                if (Keyboard.isKeyDown(KeyMaps.allDelete) && !isSelectLock) {
                    selectPosList = [];
                    selectedRailMaps = [];
                    selectPosListData.put(entity, []);
                    selectedRailMapData.put(entity, []);
                    dataMap.setInt("offsetY", 0, 1);
                    reculcRenderBlock = true;
                }

                //道路生成
                if (Keyboard.isKeyDown(KeyMaps.build) && currentItem && bezierCurveList && bezierCurveList.length > 0 && !isSelectLock) {
                    var nbt = currentItem.func_77978_p();
                    var itemBlock = Block.func_149634_a(currentItem.func_77973_b());
                    //手持ちのアイテムがNGTO指定済みミニチュアブロックか判別する || 設置可能なブロック
                    if ((nbt && nbt.func_74764_b("BlocksData")) || (itemBlock instanceof Block)) {
                        var buildData = [];
                        for (var i = 0; i < bezierCurveList.length; i++) {
                            var bezier = bezierCurveList[i];
                            buildData.push([bezier.p0, bezier.p1, bezier.p2, bezier.p3]);
                        }
                        buildData = JSON.stringify(buildData).replace(/,/g, "☆");
                        dataMap.setString("buildData", buildData, 1);
                        dataMap.setBoolean("isBuilding", true, 1);
                    }
                }

                //undo
                if (Keyboard.isKeyDown(KeyMaps.optionKey) && Keyboard.isKeyDown(KeyMaps.undo) && !isSelectLock) {
                    dataMap.setBoolean("isUndo", true, 1);
                }

                //終了
                if (Keyboard.isKeyDown(KeyMaps.endEdit) && !isSelectLock) {
                    dataMap.setBoolean("isEndEdit", true, 1);
                }
            }
            else{
                reculcRenderBlock = true;
            }

            if (isBuilding) {
                if (dataMap.getBoolean("buildComplete")) {//生成完了
                    dataMap.setString("buildData", "", 1);
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
                var railTile = getRailTile(world, lookingBlockPos.x, lookingBlockPos.y, lookingBlockPos.z);
                if (railTile && selectPosList.length === 0) {
                    var railMaps = railTile.getRailCore().getAllRailMaps();
                    for (var i = 0; i < railMaps.length; i++) {
                        renderLineFromRailMap(railSelectLine, railMaps[i], posX, posY, posZ);
                    }
                }
                else {
                    GL11.glPushMatrix();
                    GL11.glTranslatef(lookingBlockPos.x, lookingBlockPos.y + offsetY, lookingBlockPos.z);
                    GL11.glTranslatef(-posX, -posY, -posZ);
                    if (!isMasking) cursor.render(renderer);
                    else cursor_mask.render(renderer);
                    //オフセット線描画
                    for (var i = 0; i < offsetY; i++) {
                        GL11.glPushMatrix();
                        GL11.glTranslatef(0, -offsetY + i, 0);
                        if (i === 0) offsetYLine_ground.render(renderer);
                        else offsetYLine.render(renderer);
                        GL11.glPopMatrix();
                    }
                    GL11.glPopMatrix();
                }

                //ロック表示
                if (isSelectLock) {
                    GL11.glPushMatrix();
                    GL11.glTranslatef(lookingBlockPos.x, lookingBlockPos.y + offsetY, lookingBlockPos.z);
                    GL11.glTranslatef(-posX, -posY, -posZ);
                    lock.render(renderer);
                    GL11.glPopMatrix();
                }
            }

            //ブロック描画
            if (bezierCurveList && currentItem) {
                var nbt = currentItem.func_77978_p();
                if (nbt && nbt.func_74764_b("BlocksData")) {

                    //ItemMiniature.getNGTObjectは取得だけでもメモリを消費するため、HashMapになければ都度取得するようにする
                    var ngto = loadedNGTOList.get(nbt);
                    if (!ngto) {
                        ngto = ItemMiniature.getNGTObject(nbt);
                        loadedNGTOList.put(nbt, ngto);
                    }

                    if (lastNGTO.get(entity) !== ngto) {
                        lastNGTO.put(entity, ngto);
                        reculcRenderBlock = true;
                    }
                    var renderCache = renderBlockDataCache.get(entity);
                    if (!renderCache) reculcRenderBlock = true;

                    if (reculcRenderBlock) {//キャッシュ更新
                        var blockSetListArray = getBlockSetListArray(ngto, isPlaceAirBlock);
                        var lastNGTOZIndex = 0;
                        var blockDataList = [];
                        var isSkip = false;
                        var replaceBlockList = null;
                        if (isMasking) replaceBlockList = getMaskingBlocks(player);
                        bezierCurveList.forEach(function (bezierCurve3d) {
                            if (isSkip) return;
                            var split = Math.floor(bezierCurve3d.getLength() * 2);
                            var ngtoSplit = Math.floor(split / 2);
                            for (var index = 0; index < split; index++) {
                                if (isSkip) break;
                                var ngtoIndex = Math.floor(index / 2);
                                var pos = bezierCurve3d.getPoint(index, split);
                                var bezierYaw = bezierCurve3d.getYaw(index, split);
                                var bezierPitch = bezierCurve3d.getPitch(index, split);
                                var ngtoZIndex = (lastNGTOZIndex + ngtoIndex) % ngto.zSize;
                                if (ngtoIndex === ngtoSplit - 1) lastNGTOZIndex = ngtoZIndex;
                                var renderBlockPosList = rotationBlockSetList(blockSetListArray, ngtoZIndex, pos[0], pos[1], pos[2], -bezierYaw, -bezierPitch);
                                for (var blockIdx = 0; blockIdx < renderBlockPosList.length; blockIdx++) {
                                    var renderBlockPos = renderBlockPosList[blockIdx];
                                    var renderX = renderBlockPos[1] + 0.5;
                                    var renderY = renderBlockPos[2] + 0.5;
                                    var renderZ = renderBlockPos[3] + 0.5;
                                    if (isMasking) {
                                        var worldBlock = getBlock(world, renderBlockPos[1], renderBlockPos[2], renderBlockPos[3]);
                                        var isIgnoreSet = replaceBlockList.indexOf(worldBlock) === -1;
                                        //空気ブロック設置なし
                                        if (!isPlaceAirBlock && isIgnoreSet) continue;
                                        //空気ブロック設置あり
                                        if (isPlaceAirBlock) {
                                            //設置するブロックが空気ブロックではない場合、マスクの対象になる
                                            if (renderBlockPosList[blockIdx][0] !== Blocks.field_150350_a && isIgnoreSet) continue;
                                        }
                                    }
                                    GL11.glPushMatrix();
                                    GL11.glTranslatef(renderX, renderY, renderZ);
                                    GL11.glTranslatef(0, offsetY_ngto, 0);
                                    GL11.glTranslatef(-posX, -posY, -posZ);
                                    if (isMasking) block_mask.render(renderer);
                                    else block.render(renderer);
                                    GL11.glPopMatrix();
                                    blockDataList.push([renderX, renderY, renderZ]);
                                }
                                if (isNoRepeat && ngtoZIndex === ngto.zSize - 1) {
                                    isSkip = true;
                                    break;
                                }
                            }
                        });
                        renderBlockDataCache.put(entity, blockDataList);
                    }
                    else {//キャッシュが使用できる場合はこれで描画する
                        renderCache.forEach(function (blockData) {
                            GL11.glPushMatrix();
                            GL11.glTranslatef(blockData[0], blockData[1], blockData[2]);
                            GL11.glTranslatef(0, offsetY_ngto, 0);
                            GL11.glTranslatef(-posX, -posY, -posZ);
                            //GL11.glRotatef(-yaw, 0, 1, 0);
                            if (isMasking) block_mask.render(renderer);
                            else block.render(renderer);
                            GL11.glPopMatrix();
                        });
                    }
                }
            }
            else lastNGTO.put(entity, null);
        }

        //指定ポイント描画
        for (var i = 0; i < selectPosList.length; i++) {
            GL11.glPushMatrix();
            GL11.glTranslatef(selectPosList[i][0], selectPosList[i][1], selectPosList[i][2]);
            GL11.glTranslatef(-posX, -posY, -posZ);
            if (!isMasking) point.render(renderer);
            else point_mask.render(renderer);
            GL11.glPopMatrix();
        }

        //ベジェ曲線描画
        if (bezierCurveList) {
            bezierCurveList.forEach(function (bezierCurve3d) {
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
                    line.render(renderer);
                    if (index % 5 === 0) lineArrow.render(renderer);
                    if (index === 0) {
                        anchorSplit.render(renderer);
                        GL11.glPushMatrix();
                        GL11.glScalef(bezierCurve3d.getStartAnchorLength(), 1, 1);
                        anchorLine.render(renderer);
                        GL11.glPopMatrix();
                    }
                    if (index === split) {
                        anchorSplit.render(renderer);
                        GL11.glPushMatrix();
                        GL11.glRotatef(180, 0, 1, 0);
                        GL11.glScalef(bezierCurve3d.getEndAnchorLength(), 1, 1);
                        anchorLine.render(renderer);
                        GL11.glPopMatrix();
                    }
                    GL11.glPopMatrix();
                }
            });
        }
    }
}

//####  関数  ####
//# クライアントサイド #
function getLookingPos() {
    var pos = null;
    var player = MCWrapperClient.getPlayer();
    var mop = BlockUtil.getMOPFromPlayer(player, cursorMaxDistance, true);
    if (mop) {
        var lookingVec = mop.field_72307_f;
        if (isOldVer) {
            pos = {
                x: mop.field_72311_b + 0.5,
                y: mop.field_72312_c + 0.5,
                z: mop.field_72309_d + 0.5,
                posX: lookingVec.field_72450_a,
                posY: lookingVec.field_72448_b,
                posZ: lookingVec.field_72449_c
            };
        }
        else {
            var blockPos = mop.func_178782_a();
            pos = {
                x: blockPos.func_177958_n() + 0.5,
                y: blockPos.func_177956_o() + 0.5,
                z: blockPos.func_177952_p() + 0.5,
                posX: lookingVec.field_72450_a,
                posY: lookingVec.field_72448_b,
                posZ: lookingVec.field_72449_c
            };
        }
    }
    return pos;
}

function getBezierFromRailMaps(railMaps) {
    var bezierList = [];
    for (var i = 0; i < railMaps.length; i++) {
        var railMap = railMaps[i];
        var startRP = railMap.getStartRP();
        var endRP = railMap.getEndRP();
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
        bezierList.push(new BezierCurve3D(startPos, startAnchorPos, endAnchorPos, endPos));
    }
    return bezierList;
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
function getBlock(world, x, y, z) {
    if (isOldVer) return world.func_147439_a(x, y, z);
    else return BlockUtil.getBlock(world, x, y, z);
}

function createBezierCurveList(posList) {
    if (!posList || posList.length < 2) return null;

    if (posList.length === 2) {
        return [new BezierCurve3D(posList[0], lerpPoint(posList[0], posList[1], 0.5), posList[1])];
    }

    if (posList.length === 3) {
        return [new BezierCurve3D(posList[0], posList[1], posList[2])];
    }

    var bezierList = [];
    var prevPos = null;
    var currentPos = null;
    var nextPos = null;
    var startPos = null;
    var endPos = null;
    var centerPos = null;

    //始点
    startPos = posList[0];
    endPos = lerpPoint(posList[0], posList[1], 0.5);
    centerPos = lerpPoint(startPos, endPos, 0.5);
    bezierList.push(new BezierCurve3D(startPos, centerPos, endPos));

    //中間
    for (var i = 1; i < posList.length - 1; i++) {
        prevPos = posList[i - 1];
        currentPos = posList[i];
        nextPos = posList[i + 1];
        startPos = lerpPoint(prevPos, currentPos, 0.5);
        endPos = lerpPoint(currentPos, nextPos, 0.5);
        bezierList.push(new BezierCurve3D(startPos, currentPos, endPos));
    }

    //終点
    startPos = lerpPoint(posList[posList.length - 2], posList[posList.length - 1], 0.5);
    endPos = posList[posList.length - 1];
    centerPos = lerpPoint(startPos, endPos, 0.5);
    bezierList.push(new BezierCurve3D(startPos, centerPos, endPos));

    return bezierList;
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

function lerpPoint(pos1, pos2, ratio) {
    return [
        pos1[0] + (pos2[0] - pos1[0]) * ratio,
        pos1[1] + (pos2[1] - pos1[1]) * ratio,
        pos1[2] + (pos2[2] - pos1[2]) * ratio
    ];
}

function getSelectedSlotItem(player) {
    var inventory = player.field_71071_by;
    var index = inventory.field_70461_c;
    if (isOldVer) return inventory.field_70462_a[index];
    else return inventory.field_70462_a.get(index);
}

function getMaskingBlocks(player) {
    var maskingList = [];
    var inventory = player.field_71071_by.field_70462_a;
    var isEmpty = true;
    var rowIndex = 9;//0:ホットバー 9:1段目 18:2段目 27:3段目
    if (isOldVer) {
        for (var i = 0; i < 9; i++) {
            var stack = inventory[i + rowIndex];
            if (stack && stack.func_77973_b() instanceof ItemBlock) {
                isEmpty = false;
                maskingList.push(stack.func_77973_b().field_150939_a);
            }
        }
    }
    else {
        for (var i = 0; i < 9; i++) {
            var stack = inventory[i + rowIndex];
            if (stack && stack.func_77973_b() instanceof ItemBlock) {
                isEmpty = false;
                maskingList.push(stack.func_77973_b().func_179223_d());
            }
        }
    }
    if (isEmpty) maskingList = [Blocks.field_150350_a];//Blocks.AIR
    return maskingList;
}

function getTileEntity(world, x, y, z) {
    if (isOldVer) return world.func_147438_o(x, y, z);
    else {
        var blockPos = new Packages.net.minecraft.util.math.BlockPos(Math.floor(x), Math.floor(y), Math.floor(z));
        return world.func_175625_s(blockPos);
    }
}

function getRailTile(world, x, y, z) {
    var tile = getTileEntity(world, x, y, z);
    if (tile instanceof TileEntityLargeRailBase && tile.getRailCore() !== null) {
        return tile;
    }
    return null;
}

/*
blockSetListArray = [
    [ RotatableBlockSet, RotatableBlockSet... ],...
]
*/
//Z軸方向にXY平面のデータ配列を配列に入れる(z軸をindex化)
function getBlockSetListArray(ngto, isPlaceAirBlock) {
    var blockSetListArray = [];
    var centerX = ngto.xSize / 2;
    var isEvenSize = ngto.xSize % 2 === 0;
    for (var zIdx = 0; zIdx < ngto.zSize; zIdx++) {
        //XY平面
        var blockSetList = [];
        for (var xIdx = 0; xIdx < ngto.xSize; xIdx++) {
            for (var yIdx = 0; yIdx < ngto.ySize; yIdx++) {
                var blockSet = ngto.getBlockSet(xIdx, yIdx, zIdx);
                if (isPlaceAirBlock || Block.func_149682_b(blockSet.block) !== 0) {//空気は除外
                    var xPos = isEvenSize ? xIdx + 0.5 : xIdx;
                    var rotatableBlockSet = new RotatableBlockSet(blockSet, xPos, yIdx, 0);
                    rotatableBlockSet.setAxisPos(centerX, 0, 0);
                    blockSetList.push(rotatableBlockSet);
                }
            }
        }
        blockSetListArray.push(blockSetList);
    }
    return blockSetListArray;
}

//[[BlockSet, x, y, z],...]
function rotationBlockSetList(blockSetListArray, zIndex, x, y, z, yaw, pitch) {
    var newBlockSetList = [];
    for (var i = 0; i < blockSetListArray[zIndex].length; i++) {
        var rotatableBlockSet = blockSetListArray[zIndex][i];
        var blockSet = rotatableBlockSet.blockSet;
        var pos = rotatableBlockSet.getRotationPos(x, y, z, yaw, pitch);
        newBlockSetList.push([blockSet, Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)]);
    }
    return newBlockSetList;
}

//###  回転ブロック擬似クラス  ###
function RotatableBlockSet(blockSet, localX, localY, localZ) {
    this.blockSet = blockSet;
    this.local_x = localX + 0.5;
    this.local_y = localY;
    this.local_z = localZ + 0.5;
    this.axis_x = 0;
    this.axis_y = 0;
    this.axis_z = 0;
}

RotatableBlockSet.prototype = {
    setAxisPos: function (x, y, z) {
        this.axis_x = x;
        this.axis_y = y;
        this.axis_z = z;
    },
    getRotationPos: function (x, y, z, yaw, pitch) {
        var vec = new Vec3(this.local_x - this.axis_x, this.local_y - this.axis_y, this.local_z - this.axis_z);
        vec = vec.rotateAroundY(90);
        vec = vec.rotateAroundZ(pitch);
        vec = vec.rotateAroundY(yaw);
        return {
            x: x + vec.getX(),
            y: y + vec.getY(),
            z: z + vec.getZ()
        }
    }
};

//###  3次元ベジェ曲線擬似クラス  ###
function BezierCurve3D(arg1, arg2, arg3, arg4) {
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